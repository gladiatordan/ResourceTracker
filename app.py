import os
import uuid
import json
import threading
import time
import requests
import logging
from queue import Queue, Empty
from flask import Flask, jsonify, request, render_template, redirect, url_for, session, current_app
from flask_cors import CORS
from SWGBuddy.core.database import DatabaseContext

app = Flask(__name__)
CORS(app)

app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev_secret_key_change_me")
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
DISCORD_REDIRECT_URI = "https://swgbuddy.com/callback"
DISCORD_API_URL = "https://discord.com/api"

# --------------------------------------------------------------------------
# RESPONSE ROUTER (Replaces old IPC Listener)
# --------------------------------------------------------------------------
response_futures = {} # Maps Correlation ID -> Queue()

def start_response_router(reply_queue):
    """Starts the background thread that routes replies to waiting requests."""
    t = threading.Thread(target=_router_loop, args=(reply_queue,), daemon=True)
    t.start()

def _router_loop(reply_queue):
    while True:
        try:
            # Blocking get is fine here
            msg = reply_queue.get()
            cid = msg.get('id')
            if cid and cid in response_futures:
                response_futures[cid].put(msg)
        except Exception as e:
            print(f"Router Error: {e}")
            time.sleep(1)

def send_command(action, payload, server_id='cuemu', timeout=10):
    """Sends a write command to ValidationService and waits for a reply."""
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
    import urllib.parse
    scope = "identify"
    encoded_redirect = urllib.parse.quote(DISCORD_REDIRECT_URI, safe='')
    return redirect(f"{DISCORD_API_URL}/oauth2/authorize?client_id={DISCORD_CLIENT_ID}&redirect_uri={encoded_redirect}&response_type=code&scope={scope}")

@app.route('/callback')
def callback():
    code = request.args.get('code')
    if not code: return "Error: No code", 400

    data = {
        'client_id': DISCORD_CLIENT_ID,
        'client_secret': DISCORD_CLIENT_SECRET,
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': DISCORD_REDIRECT_URI,
        'scope': 'identify'
    }
    
    try:
        token_resp = requests.post(f"{DISCORD_API_URL}/oauth2/token", data=data)
        token_resp.raise_for_status()
        access_token = token_resp.json()['access_token']

        user_resp = requests.get(f"{DISCORD_API_URL}/users/@me", headers={"Authorization": f"Bearer {access_token}"})
        user_resp.raise_for_status()
        user_data = user_resp.json()

        # WRITE: Sync User to DB via ValidationService
        send_command("sync_user", user_data)
        
        session['discord_id'] = user_data['id']
        session['username'] = user_data['username']
        session['avatar'] = user_data['avatar']

        return redirect(url_for('index'))

    except Exception as e:
        return f"Login Failed: {e}", 500

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

@app.route('/api/me')
def get_current_user():
    if 'discord_id' not in session:
        return jsonify({"authenticated": False})
    
    uid = session['discord_id']
    
    # READ: Direct DB Access (Fast)
    is_super = False
    perms = {}
    
    try:
        with DatabaseContext.cursor() as cur:
            # 1. Get Superadmin Status
            cur.execute("SELECT is_superadmin FROM users WHERE discord_id = %s", (uid,))
            row = cur.fetchone()
            if row: is_super = row['is_superadmin']
            
            # 2. Get Server Roles
            cur.execute("SELECT server_id, role FROM server_permissions WHERE user_id = %s", (uid,))
            rows = cur.fetchall()
            perms = {r['server_id']: r['role'] for r in rows}
    except Exception as e:
        print(f"DB Error in /api/me: {e}")

    # Session Optimization
    old_perms = session.get('server_perms')
    old_super = session.get('is_superadmin')
    
    if old_perms != perms or old_super != is_super:
        session['server_perms'] = perms
        session['is_superadmin'] = is_super
        session.modified = True

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
    """Reads resource data directly from DB."""
    server_id = request.args.get('server', 'cuemu')
    try:
        since = float(request.args.get('since', 0))
    except:
        since = 0
    
    sql = """
        SELECT * FROM resource_spawns 
        WHERE server_id = %s 
        AND (EXTRACT(EPOCH FROM date_reported) > %s 
             OR (last_modified IS NOT NULL AND EXTRACT(EPOCH FROM last_modified) > %s))
        ORDER BY date_reported DESC
    """
    
    try:
        with DatabaseContext.cursor() as cur:
            cur.execute(sql, (server_id, since, since))
            rows = cur.fetchall()
        # Return wrapper to match frontend expectation
        return jsonify({"resources": rows})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/taxonomy', methods=['GET'])
def get_taxonomy():
    """Serves static JSON file."""
    try:
        # Assuming running from root
        path = os.path.join("SWGBuddy", "assets", "resource_hierarchy_table.json") # Or taxonomy.json
        # NOTE: You mentioned resource_hierarchy_table.json earlier. 
        # If the frontend expects the full taxonomy map, use the original taxonomy.json.
        # If you updated frontend to use hierarchy, use that. 
        # For now, sticking to static/taxonomy.json as per previous turns for safety.
        
        with open('static/taxonomy.json', 'r') as f:
            data = json.load(f)
        
        resp = jsonify(data)
        resp.headers['Cache-Control'] = 'public, max-age=86400'
        return resp
    except Exception as e:
        return jsonify({"error": "Taxonomy unavailable"}), 500

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

if __name__ == '__main__':
    # Dev mode only
    app.run(debug=True, port=5000)