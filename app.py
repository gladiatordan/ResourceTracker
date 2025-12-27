import os
import uuid
import json
import requests
import threading
import logging
from queue import Queue, Empty
from functools import wraps
from flask import Flask, jsonify, request, render_template, redirect, url_for, session, make_response
from flask_cors import CORS

# Local Imports
from SWGBuddy.core.ipc import get_client, create_packet


app = Flask(__name__)
CORS(app)

# --------------------------------------------------------------------------
# CONFIGURATION
# --------------------------------------------------------------------------
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev_secret_key_change_me")

# Discord Configuration
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
DISCORD_REDIRECT_URI = "https://swgbuddy.com/callback"
DISCORD_API_URL = "https://discord.com/api"

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("WebServer")

# --------------------------------------------------------------------------
# IPC CLIENT SETUP
# --------------------------------------------------------------------------
logger.info("Connecting to Backend IPC Socket...")
ipc_manager = get_client()

if not ipc_manager:
    logger.critical("FATAL: Could not connect to Backend IPC. Is main.py running?")
    ingress_queue = None
    egress_queue = None
else:
    logger.info("IPC Connection Established.")
    ingress_queue = ipc_manager.get_ingress_queue()
    egress_queue = ipc_manager.get_egress_web_queue()

# --------------------------------------------------------------------------
# ASYNC RESPONSE HANDLER
# --------------------------------------------------------------------------
response_futures = {} 

def response_listener():
    """Background thread to route IPC responses to waiting requests."""
    logger.info("Response Listener Thread Started")
    while True:
        try:
            message = egress_queue.get()
            correlation_id = message.get('id')
            if correlation_id in response_futures:
                response_futures[correlation_id].put(message)
        except Exception as e:
            logger.error(f"Listener Error: {e}")

if egress_queue:
    threading.Thread(target=response_listener, daemon=True).start()

def send_ipc(target, action, data=None, server_id="cuemu", timeout=5):
    """Sends command to backend and waits for response."""
    if not ingress_queue:
        return {"status": "error", "error": "Backend Unavailable"}

    correlation_id = str(uuid.uuid4())
    future_queue = Queue()
    response_futures[correlation_id] = future_queue

    # Get User Context from Session
    user_context = {
        "id": session.get('discord_id'),
        "username": session.get('username'),
        "avatar": session.get('avatar'),
        "global_role": session.get('global_role', 'USER')
    }

    packet = create_packet(target, action, data, server_id, user_context)
    packet['id'] = correlation_id
    
    try:
        ingress_queue.put(packet)
        return future_queue.get(timeout=timeout)
    except Empty:
        return {"status": "error", "error": "Backend Timeout"}
    except Exception as e:
        return {"status": "error", "error": str(e)}
    finally:
        if correlation_id in response_futures:
            del response_futures[correlation_id]

# --------------------------------------------------------------------------
# AUTHENTICATION ROUTES
# --------------------------------------------------------------------------

@app.route('/login')
def login():
    """Redirects user to Discord OAuth2 Login."""
    scope = "identify"
    discord_url = (
        f"{DISCORD_API_URL}/oauth2/authorize?client_id={DISCORD_CLIENT_ID}"
        f"&redirect_uri={DISCORD_REDIRECT_URI}&response_type=code&scope={scope}"
    )
    return redirect(discord_url)

@app.route('/callback')
def callback():
    """Handles the OAuth2 Callback from Discord."""
    code = request.args.get('code')
    if not code:
        return "Error: No code provided", 400

    # 1. Exchange Code for Token
    data = {
        'client_id': DISCORD_CLIENT_ID,
        'client_secret': DISCORD_CLIENT_SECRET,
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': DISCORD_REDIRECT_URI,
        'scope': 'identify'
    }
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    
    token_resp = requests.post(f"{DISCORD_API_URL}/oauth2/token", data=data, headers=headers)
    token_resp.raise_for_status()
    access_token = token_resp.json()['access_token']

    # 2. Get User Info
    user_resp = requests.get(f"{DISCORD_API_URL}/users/@me", headers={
        "Authorization": f"Bearer {access_token}"
    })
    user_resp.raise_for_status()
    user_data = user_resp.json()

    # 3. Store in Session
    session['discord_id'] = user_data['id']
    session['username'] = user_data['username']
    session['avatar'] = user_data['avatar']
    
    # 4. Sync User to Backend (Create/Update User in DB)
    # We fire-and-forget this update so we don't block the login
    send_ipc("validation", "sync_user", data=user_data)

    return redirect(url_for('index'))

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

@app.route('/api/me')
def get_current_user():
    """Returns the current logged-in user to the frontend JS."""
    if 'discord_id' not in session:
        return jsonify({"authenticated": False})
    
    return jsonify({
        "authenticated": True,
        "id": session['discord_id'],
        "username": session['username'],
        "avatar": session['avatar']
    })

# --------------------------------------------------------------------------
# RESOURCE ROUTES
# --------------------------------------------------------------------------

@app.route('/')
def index():
    return render_template("index.html")

@app.route('/api/resource_log', methods=['GET'])
def queryResourceLog():
    server_id = request.args.get('server', 'cuemu')
    resp = send_ipc("validation", "get_init_data", server_id=server_id)
    
    if resp['status'] == 'success':
        return jsonify(resp['data']['resources'])
    return jsonify({"error": resp.get('error')}), 500

@app.route('/api/taxonomy', methods=['GET'])
def get_taxonomy():
    resp = send_ipc("validation", "get_init_data")
    if resp['status'] == 'success':
        # Flatten for frontend
        return jsonify(list(resp['data']['taxonomy'].values()))
    return jsonify({"error": resp.get('error')}), 500

@app.route('/api/add-resource', methods=['POST'])
def add_resource():
    """Endpoint to Create a New Resource."""
    if 'discord_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.json
    server_id = data.get('server_id', 'cuemu')
    
    resp = send_ipc("validation", "add_resource", data=data, server_id=server_id)
    
    if resp['status'] == 'success':
        return jsonify({"success": True})
    return jsonify({"error": resp.get('error')}), 500

@app.route('/api/update-status', methods=['POST'])
def update_status():
    if 'discord_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    server_id = data.get('server_id', 'cuemu')
    resp = send_ipc("validation", "update_status", data=data, server_id=server_id)
    
    if resp['status'] == 'success':
        return jsonify({"success": True})
    return jsonify({"error": resp.get('error')}), 500

@app.route('/api/update-resource', methods=['POST'])
def update_resource():
    if 'discord_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    # Logic to be handled by ValidationService 'update_resource' action
    resp = send_ipc("validation", "update_resource", data=data) 
    
    if resp['status'] == 'success':
        return jsonify({"success": True})
    return jsonify({"error": resp.get('error')}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)