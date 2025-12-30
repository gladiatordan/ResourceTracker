import os
import uuid
import json
import threading
import time
import requests
import secrets
import urllib.parse
from queue import Queue, Empty
from flask import Flask, jsonify, request, render_template, redirect, url_for, session, current_app
from flask_cors import CORS
from SWGBuddy.core.database import DatabaseContext


# Helper for Role Levels (Duplicate of ValidationService for Read Logic)
ROLE_HIERARCHY = {
	'SUPERADMIN': 100,
	'ADMIN': 3,
	'EDITOR': 2,
	'USER': 1,
	'GUEST': 0
}

app = Flask(__name__)
CORS(app)

# Configuration
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev_secret_key_change_me")
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
DISCORD_REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI", "https://swgbuddy.com/callback")
DISCORD_API_URL = "https://discord.com/api"

# --------------------------------------------------------------------------
# RESPONSE ROUTER
# --------------------------------------------------------------------------
response_futures = {} 

def start_response_router(reply_queue):
	t = threading.Thread(target=_router_loop, args=(reply_queue,), daemon=True)
	t.start()

def _router_loop(reply_queue):
	while True:
		try:
			msg = reply_queue.get()
			cid = msg.get('id')
			if cid and cid in response_futures:
				response_futures[cid].put(msg)
		except Exception as e:
			print(f"Router Error: {e}")
			time.sleep(1)

def send_command(action, payload, server_id='cuemu', timeout=10):
	if 'VAL_QUEUE' not in current_app.config:
		return {"status": "error", "error": "Backend Unavailable"}

	cid = str(uuid.uuid4())
	future = Queue()
	response_futures[cid] = future
	
	user_context = {
		"id": session.get('discord_id'),
		"username": session.get('username'),
		"avatar": session.get('avatar')
	}
	
	packet = {
		"id": cid,
		"action": action,
		"payload": payload,
		"server_id": server_id,
		"user_context": user_context
	}
	
	try:
		current_app.config['VAL_QUEUE'].put(packet)
		response = future.get(timeout=timeout)
		return response
	except Empty:
		return {"status": "error", "error": "Request Timed Out"}
	except Exception as e:
		return {"status": "error", "error": str(e)}
	finally:
		response_futures.pop(cid, None)

# --------------------------------------------------------------------------
# ROUTES
# --------------------------------------------------------------------------

@app.route('/')
def index():
	return render_template("index.html")

# --- AUTHENTICATION ---

@app.route('/login')
def login():
	state = secrets.token_urlsafe(16)
	session['oauth_state'] = state
	
	scope = "identify"
	params = {
		'client_id': DISCORD_CLIENT_ID,
		'redirect_uri': DISCORD_REDIRECT_URI,
		'response_type': 'code',
		'scope': scope,
		'state': state
	}
	
	url = f"{DISCORD_API_URL}/oauth2/authorize?{urllib.parse.urlencode(params)}"
	return redirect(url)

@app.route('/callback')
def callback():
	received_state = request.args.get('state')
	stored_state = session.pop('oauth_state', None)
	
	if not received_state or received_state != stored_state:
		return "Error: State mismatch. Please try logging in again.", 400

	code = request.args.get('code')
	if not code: return "Error: No code provided", 400

	data = {
		'client_id': DISCORD_CLIENT_ID,
		'client_secret': DISCORD_CLIENT_SECRET,
		'grant_type': 'authorization_code',
		'code': code,
		'redirect_uri': DISCORD_REDIRECT_URI
	}
	
	try:
		token_resp = requests.post(f"{DISCORD_API_URL}/oauth2/token", data=data)
		token_resp.raise_for_status()
		access_token = token_resp.json()['access_token']

		user_resp = requests.get(f"{DISCORD_API_URL}/users/@me", headers={"Authorization": f"Bearer {access_token}"})
		user_resp.raise_for_status()
		user_data = user_resp.json()

		send_command("sync_user", user_data)
		
		session.permanent = True
		session['discord_id'] = user_data['id']
		session['username'] = user_data['username']
		session['avatar'] = user_data['avatar']

		return redirect(url_for('index'))

	except Exception as e:
		print(f"Login Error: {e}")
		return f"Login Failed: {str(e)}", 500

@app.route('/logout')
def logout():
	session.clear()
	return redirect(url_for('index'))

@app.route('/api/me')
def get_current_user():
	if 'discord_id' not in session:
		return jsonify({"authenticated": False})
	
	uid = session['discord_id']
	is_super = False
	perms = {}
	
	try:
		with DatabaseContext.cursor() as cur:
			cur.execute("SELECT is_superadmin FROM users WHERE discord_id = %s", (uid,))
			row = cur.fetchone()
			if row: is_super = row['is_superadmin']
			
			cur.execute("SELECT server_id, role FROM server_permissions WHERE user_id = %s", (uid,))
			rows = cur.fetchall()
			perms = {r['server_id']: r['role'] for r in rows}
	except Exception as e:
		print(f"DB Error in /api/me: {e}")

	session['server_perms'] = perms
	session['is_superadmin'] = is_super

	return jsonify({
		"authenticated": True,
		"id": uid,
		"username": session['username'],
		"avatar": session['avatar'],
		"is_superadmin": is_super,
		"server_perms": perms
	})

# --- DATA ENDPOINTS ---

@app.route('/api/resource_log', methods=['GET'])
def queryResourceLog():
	if 'discord_id' not in session:
		return jsonify({"error": "Unauthorized", "resources": []}), 401

	server_id = request.args.get('server', 'cuemu')
	try:
		since = float(request.args.get('since', 0))
	except:
		since = 0
	
	# UPDATED SQL: Joins users table to get the reporter's name
	# Assumes 'reporter_id' exists in resource_spawns. If not, this needs a DB migration.
	sql = """
		SELECT rs.*, 
			   rt.class_label as type, 
			   u.username as reporter_name,
			   EXTRACT(EPOCH FROM rs.date_reported) as date_reported_ts,
			   EXTRACT(EPOCH FROM rs.last_modified) as last_modified_ts
		FROM resource_spawns rs
		JOIN resource_taxonomy rt ON rs.resource_class_id = rt.id
		LEFT JOIN users u ON rs.reporter_id = u.discord_id
		WHERE rs.server_id = %s 
		AND (EXTRACT(EPOCH FROM rs.date_reported) > %s 
			 OR (rs.last_modified IS NOT NULL AND EXTRACT(EPOCH FROM rs.last_modified) > %s))
		ORDER BY rs.date_reported DESC
	"""
	
	try:
		with DatabaseContext.cursor() as cur:
			cur.execute(sql, (server_id, since, since))
			rows = cur.fetchall()
		return jsonify({"resources": rows})
	except Exception as e:
		return jsonify({"error": str(e)}), 500

@app.route('/api/taxonomy', methods=['GET'])
def get_taxonomy():
	"""Serves the single Unified Taxonomy file."""
	try:
		base_dir = os.path.dirname(os.path.abspath(__file__))
		# Updated to point to the new single source of truth
		path = os.path.join(base_dir, "assets", "resource_taxonomy.json")
		with open(path, 'r') as f:
			data = json.load(f)
		resp = jsonify(data)
		resp.headers['Cache-Control'] = 'public, max-age=86400'
		return resp
	except Exception as e:
		return jsonify({"error": f"Taxonomy unavailable: {e}"}), 500

# --- WRITE OPERATIONS ---

@app.route('/api/add-resource', methods=['POST'])
def add_resource():
	if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
	
	data = request.json
	resp = send_command("add_resource", data, server_id=data.get('server_id', 'cuemu'))
	
	if resp['status'] == 'success': return jsonify({"success": True})
	return jsonify({"error": resp.get('error')}), 500

@app.route('/api/update-resource', methods=['POST'])
def update_resource():
	if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
	
	data = request.json
	resp = send_command("update_resource", data, server_id=data.get('server_id', 'cuemu'))
	
	if resp['status'] == 'success': return jsonify({"success": True})
	return jsonify({"error": resp.get('error')}), 500

@app.route('/api/retire-resource', methods=['POST'])
def retire_resource():
	if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
	
	data = request.json
	resp = send_command("retire_resource", data, server_id=data.get('server_id', 'cuemu'))
	
	if resp['status'] == 'success': return jsonify({"success": True})
	return jsonify({"error": resp.get('error')}), 500

@app.route('/api/set-role', methods=['POST'])
def set_role():
	if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
	
	data = request.json
	resp = send_command("set_user_role", data, server_id=data.get('server_id', 'cuemu'))
	
	if resp['status'] == 'success': return jsonify({"success": True})
	return jsonify({"error": resp.get('error')}), 500

@app.route('/api/admin/reload-cache', methods=['POST'])
def reload_cache():
	if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
	
	# Optional: Check for SuperAdmin permission here if desired
	if not session.get('is_superadmin'):
		return jsonify({"error": "Forbidden"}), 403

	resp = send_command("reload_cache", {})
	
	if resp['status'] == 'success':
		return jsonify({"success": True, "message": "Cache reloaded successfully."})
	return jsonify({"error": resp.get('error')}), 500

@app.route('/api/admin/users', methods=['GET'])
def get_managed_users():
	if 'discord_id' not in session: 
		return jsonify({"error": "Unauthorized"}), 401

	uid = session['discord_id']
	server_id = request.args.get('server', 'cuemu')
	
	# 1. Determine Requester's Role Level
	req_level = 0
	if session.get('is_superadmin'):
		req_level = 100
	else:
		perms = session.get('server_perms', {})
		role_str = perms.get(server_id, 'GUEST')
		req_level = ROLE_HIERARCHY.get(role_str, 0)

	# Only Editors (2) and up can manage
	if req_level < 2:
		return jsonify({"error": "Forbidden"}), 403

	# 2. Fetch All Users for this Server
	# We join users with server_permissions
	sql = """
		SELECT u.discord_id, u.username, u.avatar_url, sp.role
		FROM server_permissions sp
		JOIN users u ON sp.user_id = u.discord_id
		WHERE sp.server_id = %s
	"""
	
	try:
		with DatabaseContext.cursor() as cur:
			cur.execute(sql, (server_id,))
			all_users = cur.fetchall()
			
		# 3. Filter: Only show users with strictly LOWER role level
		manageable_users = []
		for u in all_users:
			u_role = u['role']
			u_level = ROLE_HIERARCHY.get(u_role, 0)
			
			# SuperAdmins can see everyone except other SuperAdmins
			if u_level < req_level:
				manageable_users.append({
					"id": u['discord_id'],
					"username": u['username'],
					"avatar": u['avatar_url'],
					"role": u_role
				})
				
		return jsonify({"users": manageable_users})

	except Exception as e:
		print(str(e))
		return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
	app.run(debug=True, port=5000)