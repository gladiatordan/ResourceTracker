"""
SWGBuddy ValidationService Module

The Gatekeeper. Handles all writes, permission checks, data integrity, and stat calculations.
"""
import sys
import json
import os
import traceback
from core.core import Core
from core.database import DatabaseContext

class ValidationService(Core):
	# Role Power Levels
	ROLE_HIERARCHY = {
		'SUPERADMIN': 100,
		'ADMIN': 3,
		'EDITOR': 2,
		'USER': 1,
		'GUEST': 0
	}

	# Maps JSON keys to DB Columns
	STAT_COLS = [
		"res_oq", "res_cd", "res_dr", "res_fl", "res_hr", 
		"res_ma", "res_pe", "res_sr", "res_ut", "res_cr"
	]

	def __init__(self, input_queue, log_queue, reply_queue=None):
		super().__init__(log_queue)
		self.input_queue = input_queue
		self.reply_queue = reply_queue
		self.running = True
		
		# Caches
		self.valid_resources = {} # Will be populated by flattening the tree
	
	def _flatten_taxonomy(self, nodes):
		"""Recursively walks the tree to build the label -> config map."""
		for node in nodes:
			if node.get('is_valid'):
				self.valid_resources[node['label']] = {
					"id": node['id'],
					"stats": node.get('stats', {}),
					"planets": node.get('planets', [])
				}
			
			if node.get('children'):
				self._flatten_taxonomy(node['children'])

	def run(self):
		DatabaseContext.initialize()
		self.info("Initializing Validation Service...")
		
		# 1. Load Single Taxonomy File
		try:
			json_path = os.path.join(os.getcwd(), "assets", "resource_taxonomy.json")
			with open(json_path, 'r') as f:
				tree_data = json.load(f)
			
			# Flatten tree into self.valid_resources map
			self._flatten_taxonomy(tree_data)
			self.info(f"Loaded taxonomy. Valid types: {len(self.valid_resources)}")
			
		except Exception as e:
			self.critical(f"FATAL: Failed to load resource_taxonomy.json: {e}")
			return

		# 2. Hydrate DB Caches
		try:
			self._hydrate_permissions()
		except Exception as e:
			self.critical(f"FATAL: Failed to hydrate DB maps: {e}")
			return

		self.info("Validation Service Ready.")

		# 3. Main Loop
		while self.running:
			try:
				message = self.input_queue.get()
				if message is None: break
				self._process_message(message)
			except KeyboardInterrupt:
				self.running = False
			except Exception as e:
				self.error(f"Worker Loop Crash: {e}\n{traceback.format_exc()}")

	def _hydrate_permissions(self):
		"""Loads command permissions from the database."""
		with DatabaseContext.cursor() as cur:
			cur.execute("SELECT command, min_role_level FROM command_permissions")
			rows = cur.fetchall()
		self.command_permissions = {r['command']: r['min_role_level'] for r in rows}
		self.info(f"Hydrated Permissions for {len(self.command_permissions)} commands.")

	# ----------------------------------------------------------------------
	# MESSAGE PROCESSING
	# ----------------------------------------------------------------------
	def _process_message(self, packet):
		action = packet.get('action')
		payload = packet.get('payload') or {}
		user_ctx = packet.get('user_context', {})
		server_id = packet.get('server_id', 'cuemu')
		correlation_id = packet.get('id')
		
		response = {"id": correlation_id, "status": "success", "error": None}

		try:
			# 1. Check Command Registry
			required_power = self.command_permissions.get(action, 100)
			
			# EXCEPTION: sync_user is allowed for Guests (login flow)
			if action == 'sync_user':
				required_power = 0

			# 2. Verify Permissions
			if required_power > 0:
				is_allowed, user_role = self._check_permission(user_ctx, server_id, required_power)
				if not is_allowed:
					raise PermissionError(f"Insufficient Permissions. Your Role: {user_role}, Required Level: {required_power}")

			# 3. Route Command
			if action == "sync_user":
				self._sync_user(payload)

			elif action == "add_resource":
				# Pass user_ctx to handle_write
				self._handle_write(payload, server_id, is_new=True, user_ctx=user_ctx) 
				self.info(f"User {user_ctx.get('username')} added resource: {payload.get('name')}")

			elif action == "update_resource":
				self._handle_write(payload, server_id, is_new=False, user_ctx=user_ctx)
				self.info(f"User {user_ctx.get('username')} updated resource ID: {payload.get('id')}")

			elif action == "retire_resource":
				self._retire_resource(payload, server_id)
				self.info(f"User {user_ctx.get('username')} retired resource ID: {payload.get('id')}")

			elif action == "set_user_role":
				self._set_user_role(user_ctx, payload, server_id)
				self.info(f"Role change: {payload.get('target_user_id')} -> {payload.get('role')} on {server_id}")
			
			else:
				raise ValueError(f"No handler for action: {action}")

		except (PermissionError, ValueError) as e:
			self.warning(f"Rejected {action}: {e}")
			response['status'] = 'error'
			response['error'] = str(e)
		except Exception as e:
			self.error(f"System Error on {action}: {e}\n{traceback.format_exc()}")
			response['status'] = 'error'
			response['error'] = "Internal Server Error"
		
		if self.reply_queue and correlation_id:
			self.reply_queue.put(response)

	# ----------------------------------------------------------------------
	# COMMAND LOGIC
	# ----------------------------------------------------------------------
	def _handle_write(self, data, server_id, is_new, user_ctx=None):
		"""Unified Add/Edit logic with calculation and uniqueness check."""
		
		# 1. Validate (Includes Class ID Check, Stats, and Planet)
		self._validate_resource(data)

		# 2. Calculate Ratings
		self._calculate_ratings(data)

		# 3. DB Write
		if is_new:
			name = data.get('name')
			if self._resource_exists(name, server_id):
				raise ValueError(f"Error: {name} already exists for {server_id}")
			self._insert_resource(data, server_id, user_ctx)
		else:
			self._update_resource(data, user_ctx)

	def _resource_exists(self, name, server_id):
		if not name: return False
		with DatabaseContext.cursor() as cur:
			cur.execute("SELECT 1 FROM resource_spawns WHERE name = %s AND server_id = %s", (name, server_id))
			return cur.fetchone() is not None

	def _retire_resource(self, data, server_id):
		res_id = data.get('id')
		if not res_id: 
			raise ValueError("Missing ID for retire command")

		sql_move = """
			INSERT INTO retired_resources 
			SELECT * FROM resource_spawns 
			WHERE id = %s AND server_id = %s
		"""
		sql_delete = "DELETE FROM resource_spawns WHERE id = %s AND server_id = %s"

		with DatabaseContext.cursor(commit=True) as cur:
			cur.execute(sql_move, (res_id, server_id))
			if cur.rowcount == 0:
				raise ValueError("Resource not found or already retired.")
			cur.execute(sql_delete, (res_id, server_id))

	def _set_user_role(self, requester_ctx, payload, server_id):
		target_uid = payload.get('target_user_id')
		target_role = payload.get('role').upper()
		
		if target_role not in self.ROLE_HIERARCHY:
			raise ValueError(f"Invalid role: {target_role}")

		req_uid = requester_ctx.get('id')
		is_allowed, req_role_name = self._check_permission(requester_ctx, server_id, 0)
		
		req_power = self.ROLE_HIERARCHY.get(req_role_name, 0)
		target_power = self.ROLE_HIERARCHY.get(target_role, 0)

		if req_role_name == 'SUPERADMIN':
			pass 
		elif req_role_name == 'ADMIN':
			if target_power >= 3: 
				raise PermissionError("Admins cannot promote users to Admin or SuperAdmin.")
		elif req_role_name == 'EDITOR':
			if target_power >= 2:
				raise PermissionError("Editors cannot promote users to Editor, Admin, or SuperAdmin.")
		else:
			raise PermissionError("Your role cannot assign permissions.")

		sql = """
			INSERT INTO server_permissions (user_id, server_id, role, assigned_by)
			VALUES (%s, %s, %s, %s)
			ON CONFLICT (user_id, server_id) 
			DO UPDATE SET role = EXCLUDED.role, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()
		"""
		with DatabaseContext.cursor(commit=True) as cur:
			cur.execute(sql, (target_uid, server_id, target_role, req_uid))

	# ----------------------------------------------------------------------
	# STAT CALCULATIONS & VALIDATION
	# ----------------------------------------------------------------------
	def _get_rules(self, data):
		label = data.get('type') 
		if not label:
			raise ValueError(f"Missing Resource Type/Label")
		
		rules = self.valid_resources.get(label)
		if not rules:
			raise ValueError(f"Resource type '{label}' is not valid for spawning.")
		return rules

	def _validate_resource(self, data):
		rules = self._get_rules(data)
		stats_def = rules.get('stats', {})
		allowed_planets = rules.get('planets', [])

		# Planet Validation
		planet = data.get('planet')
		if planet and planet not in allowed_planets and len(allowed_planets) > 0:
			raise ValueError(f"Planet '{planet}' is not valid for this resource type.")

		# Stat Validation
		for stat in self.STAT_COLS:
			val = data.get(stat)
			if val is None or val == "": continue
			
			try:
				val = int(val)
			except: 
				raise ValueError(f"{stat} must be an integer")

			if stat not in stats_def:
				if val > 0: raise ValueError(f"{stat} is not applicable for this resource.")
				continue

			mn = stats_def[stat]['min']
			mx = stats_def[stat]['max']
			if not (mn <= val <= mx):
				raise ValueError(f"{stat} value {val} is out of range ({mn}-{mx}).")

	def _calculate_ratings(self, data):
		rules = self._get_rules(data)
		stats_def = rules.get('stats', {})
		valid_ratings = []

		for stat in self.STAT_COLS:
			val = data.get(stat)
			if val is None or val == "" or str(val) == "0": continue
				
			val = int(val)
			stat_max = stats_def[stat]['max']
			rating = round(val / stat_max, 3) if stat_max > 0 else 0.0
			
			data[f"{stat}_rating"] = rating
			valid_ratings.append(rating)

		if valid_ratings:
			avg = sum(valid_ratings) / len(valid_ratings)
			data['res_weight_rating'] = round(avg, 3)
		else:
			data['res_weight_rating'] = 0.0

	# ----------------------------------------------------------------------
	# DB UTILS
	# ----------------------------------------------------------------------
	def _insert_resource(self, data, server_id, user_ctx):
		# 1. Get Class ID directly from Config
		label = data.get('type')
		rules = self.valid_resources.get(label, {})
		res_class_id = rules.get('id')

		# Get Reporter ID from context
		reporter_id = user_ctx.get('id') if user_ctx else None

		cols = ["server_id", "resource_class_id", "name", "planet", "res_weight_rating", "notes", "reporter_id"]
		vals = [
			server_id, res_class_id, data['name'], data.get('planet'), 
			data.get('res_weight_rating', 0.0), data.get('notes', ''), reporter_id
		]

		# Add Stats
		for stat in self.STAT_COLS:
			if data.get(stat):
				cols.append(stat)
				vals.append(data[stat])
			if data.get(f"{stat}_rating") is not None:
				cols.append(f"{stat}_rating")
				vals.append(data[f"{stat}_rating"])

		# 3. Generate SQL with Placeholders (Safe)
		placeholders = ",".join(["%s"] * len(vals))
		sql = f"INSERT INTO resource_spawns ({','.join(cols)}) VALUES ({placeholders})"
		
		with DatabaseContext.cursor(commit=True) as cur:
			cur.execute(sql, tuple(vals))

	def _update_resource(self, data, user_ctx):
		res_id = data.get('id')
		# We can also update reporter_id on edit if we want "Last Edited By" behavior
		reporter_id = user_ctx.get('id') if user_ctx else None
		
		set_clauses = ["last_modified = NOW()", "res_weight_rating = %s", "reporter_id = %s"]
		vals = [data.get('res_weight_rating', 0.0), reporter_id]
		
		for stat in self.STAT_COLS:
			if stat in data:
				set_clauses.append(f"{stat} = %s")
				vals.append(data[stat])
			if f"{stat}_rating" in data:
				set_clauses.append(f"{stat}_rating = %s")
				vals.append(data[f"{stat}_rating"])

		for field in ['notes', 'is_active', 'planet']:
			if field in data:
				set_clauses.append(f"{field} = %s")
				vals.append(data[field])

		vals.append(res_id)
		sql = f"UPDATE resource_spawns SET {', '.join(set_clauses)} WHERE id = %s"
		
		with DatabaseContext.cursor(commit=True) as cur:
			cur.execute(sql, tuple(vals))

	def _check_permission(self, user_ctx, server_id, required_power):
		if not user_ctx or not user_ctx.get('id'): return False, 'GUEST'
		uid = user_ctx.get('id')
		
		with DatabaseContext.cursor() as cur:
			cur.execute("SELECT is_superadmin FROM users WHERE discord_id = %s", (uid,))
			u = cur.fetchone()
			if u and u['is_superadmin']: return True, 'SUPERADMIN'
			
			cur.execute("SELECT role FROM server_permissions WHERE user_id = %s AND server_id = %s", (uid, server_id))
			p = cur.fetchone()
			
		role = p['role'] if p else 'GUEST'
		user_power = self.ROLE_HIERARCHY.get(role, 0)
		
		return user_power >= required_power, role

	def _sync_user(self, data):
		"""
		Upserts the user into the users table and ensures they have default 'USER'
		permissions on all registered game servers.
		"""
		uid = data.get('id')
		username = data.get('username')
		avatar = data.get('avatar')

		# 1. Upsert User Profile
		sql_user = """
			INSERT INTO users (discord_id, username, avatar_url, last_login) 
			VALUES (%s, %s, %s, NOW())
			ON CONFLICT (discord_id) 
			DO UPDATE SET username=EXCLUDED.username, avatar_url=EXCLUDED.avatar_url, last_login=NOW()
		"""

		# 2. Get All Active Game Servers
		sql_get_servers = "SELECT id FROM game_servers"

		# 3. Grant Default Role (USER)
		# assigned_by is set to the user themselves (uid) for self-registration.
		# ON CONFLICT DO NOTHING ensures we don't overwrite existing higher roles (like ADMIN).
		sql_grant_perm = """
			INSERT INTO server_permissions (user_id, server_id, role, assigned_by)
			VALUES (%s, %s, 'USER', %s)
			ON CONFLICT (user_id, server_id) DO NOTHING
		"""

		try:
			with DatabaseContext.cursor(commit=True) as cur:
				# Update User Table
				cur.execute(sql_user, (uid, username, avatar))
				
				# Fetch Servers
				cur.execute(sql_get_servers)
				servers = cur.fetchall()
				
				# Iterate and Grant Permissions
				for server in servers:
					# Access by key 'id' assuming DictCursor is in use
					sid = server['id']
					cur.execute(sql_grant_perm, (uid, sid, uid))
					
			self.info(f"Synced user {username} ({uid}) and checked permissions for {len(servers)} servers.")

		except Exception as e:
			self.error(f"Error syncing user {username}: {e}")
			# Re-raise to ensure the caller knows sync failed
			raise e