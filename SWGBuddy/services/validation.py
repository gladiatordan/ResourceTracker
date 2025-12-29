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
		self.valid_resources = {} 
		self.id_to_label = {}     
		self.command_permissions = {} 

	def run(self):
		DatabaseContext.initialize()
		self.info("Initializing Validation Service...")
		
		# 1. Load Static JSON Rules
		try:
			# Assumes running from root directory via 'python3 -m SWGBuddy.main'
			json_path = os.path.join(os.getcwd(), "assets", "valid_resource_table.json")
			with open(json_path, 'r') as f:
				self.valid_resources = json.load(f)
			self.info(f"Loaded rules for {len(self.valid_resources)} resource types.")
		except Exception as e:
			self.critical(f"FATAL: Failed to load valid_resource_table.json: {e}")
			return

		# 2. Hydrate DB Caches
		try:
			self._hydrate_id_map()
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

	def _hydrate_id_map(self):
		"""Maps swg_index (int) -> class_label (str) for rule lookup."""
		with DatabaseContext.cursor() as cur:
			cur.execute("SELECT swg_index, class_label FROM resource_taxonomy")
			rows = cur.fetchall()
		self.id_to_label = {r['swg_index']: r['class_label'] for r in rows}
		self.info(f"Hydrated ID Map with {len(self.id_to_label)} entries.")

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
			# Default to 100 (SuperAdmin only) if command not found for safety
			required_power = self.command_permissions.get(action, 100)
			
			# 2. Verify Permissions
			if required_power > 0:
				is_allowed, user_role = self._check_permission(user_ctx, server_id, required_power)
				if not is_allowed:
					raise PermissionError(f"Insufficient Permissions. Your Role: {user_role}, Required Level: {required_power}")
			
			# Pass role to handlers that need it (like set_user_role)
			# We re-fetch inside specific handlers if needed, but passing context is cleaner.

			# 3. Route Command
			if action == "sync_user":
				self._sync_user(payload)

			elif action == "add_resource":
				self._handle_write(payload, server_id, is_new=True)
				self.info(f"User {user_ctx.get('username')} added resource: {payload.get('name')}")

			elif action == "update_resource":
				self._handle_write(payload, server_id, is_new=False)
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
	def _handle_write(self, data, server_id, is_new):
		"""Unified Add/Edit logic with calculation and uniqueness check."""
		
		# 1. Validate (Includes Class ID Check, Stats, and Planet)
		self._validate_resource(data)

		# 2. Calculate Ratings
		self._calculate_ratings(data)

		# 3. DB Write
		if is_new:
			# Check for existing resource name on this server
			name = data.get('name')
			if self._resource_exists(name, server_id):
				raise ValueError(f"Error: {name} already exists for {server_id}")
			
			self._insert_resource(data, server_id)
		else:
			self._update_resource(data)

	def _resource_exists(self, name, server_id):
		"""Checks if a resource name is already in use for the server."""
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
		"""
		Handles role assignment based on the strict hierarchy:
		SuperAdmin -> Can assign anything.
		Admin (3)  -> Can assign up to Editor (2).
		Editor (2) -> Can assign up to User (1).
		"""
		target_uid = payload.get('target_user_id')
		target_role = payload.get('role').upper()
		
		if target_role not in self.ROLE_HIERARCHY:
			raise ValueError(f"Invalid role: {target_role}")

		# 1. Determine Requester Power
		req_uid = requester_ctx.get('id')
		is_allowed, req_role_name = self._check_permission(requester_ctx, server_id, 0) # Get current role
		
		req_power = self.ROLE_HIERARCHY.get(req_role_name, 0)
		target_power = self.ROLE_HIERARCHY.get(target_role, 0)

		# 2. Hierarchy Logic
		if req_role_name == 'SUPERADMIN':
			pass # Superadmin can do anything
		elif req_role_name == 'ADMIN':
			if target_power >= 3: 
				raise PermissionError("Admins cannot promote users to Admin or SuperAdmin.")
		elif req_role_name == 'EDITOR':
			if target_power >= 2:
				raise PermissionError("Editors cannot promote users to Editor, Admin, or SuperAdmin.")
		else:
			raise PermissionError("Your role cannot assign permissions.")

		# 3. Execute Assignment
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
		# Handle string labels directly if passed, or ID lookup
		# Frontend now sends 'type' string (label)
		label = data.get('type') 
		
		# Fallback for old ID behavior if needed
		if not label and data.get('resource_class_id'):
			label = self.id_to_label.get(int(data['resource_class_id']))

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

		# 1. Planet Validation
		# Data might come in as 'planet' (string) or 'planets' (list) from frontend tweaks
		planet = data.get('planet')
		if planet:
			if planet not in allowed_planets:
				# Relaxed check for "Kashyyykian" etc if not strictly in list but derived? 
				# For now strict check based on valid_resource_table.json
				raise ValueError(f"Planet '{planet}' is not valid for this resource type.")

		# 2. Stat Validation
		for stat in self.STAT_COLS:
			val = data.get(stat)
			# If 0 or None, skip unless required? Assuming 0 is valid "empty"
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
			# Divide by Max to get 0.0-1.0
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
	def _insert_resource(self, data, server_id):
		res_class_id = data.get('resource_class_id')
		
		cols = ["server_id", "resource_class_id", "name", "planet", "res_weight_rating"]
		vals = [server_id, res_class_id, data['name'], data.get('planet'), data['res_weight_rating']]

		for stat in self.STAT_COLS:
			if data.get(stat):
				cols.append(stat)
				vals.append(data[stat])
			if data.get(f"{stat}_rating") is not None:
				cols.append(f"{stat}_rating")
				vals.append(data[f"{stat}_rating"])

		placeholders = ",".join(["%s"] * len(cols))

		sql = f"INSERT INTO resource_spawns ({','.join(cols)}) VALUES ({placeholders})"
		self.info(f"[ValidationService] {sql}")
		
		with DatabaseContext.cursor(commit=True) as cur:
			cur.execute(sql, tuple(vals))

	def _update_resource(self, data):
		res_id = data.get('id')
		set_clauses = ["last_modified = NOW()", "res_weight_rating = %s"]
		vals = [data['res_weight_rating']]
		
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
		"""Returns (bool is_allowed, str user_role)"""
		if not user_ctx or not user_ctx.get('id'): return False, 'GUEST'
		uid = user_ctx.get('id')
		
		with DatabaseContext.cursor() as cur:
			cur.execute("SELECT is_superadmin FROM users WHERE discord_id = %s", (uid,))
			u = cur.fetchone()
			if u and u['is_superadmin']: return True, 'SUPERADMIN'
			
			cur.execute("SELECT role FROM server_permissions WHERE user_id = %s AND server_id = %s", (uid, server_id))
			p = cur.fetchone()
			
		role = p['role'] if p else 'GUEST' # Default to GUEST if logged in
		user_power = self.ROLE_HIERARCHY.get(role, 0) # User = 1
		
		return user_power >= required_power, role

	def _sync_user(self, data):
		sql = """INSERT INTO users (discord_id, username, avatar_url, last_login) VALUES (%s, %s, %s, NOW())
				 ON CONFLICT (discord_id) DO UPDATE SET username=EXCLUDED.username, avatar_url=EXCLUDED.avatar_url, last_login=NOW()"""
		with DatabaseContext.cursor(commit=True) as cur:
			cur.execute(sql, (data.get('id'), data.get('username'), data.get('avatar')))
