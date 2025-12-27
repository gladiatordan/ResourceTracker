import os
import uuid
import json
import requests
import threading
import logging
import time
from queue import Queue, Empty
from flask import Flask, jsonify, request, render_template, redirect, url_for, session
from flask_cors import CORS

# Local Imports
from SWGBuddy.core.ipc import get_client, create_packet

app = Flask(__name__)
CORS(app)

app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev_secret_key_change_me")
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
DISCORD_REDIRECT_URI = "https://swgbuddy.com/callback"
DISCORD_API_URL = "https://discord.com/api"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("WebServer")

# --------------------------------------------------------------------------
# ROBUST IPC CLIENT
# --------------------------------------------------------------------------
ipc_lock = threading.Lock()
ipc_manager = None
ingress_queue = None
egress_queue = None

def connect_ipc():
    """Attempts to connect to the backend IPC socket."""
    global ipc_manager, ingress_queue, egress_queue
    try:
        logger.info("Attempting IPC Connection...")
        manager = get_client()
        if manager:
            ipc_manager = manager
            ingress_queue = manager.get_ingress_queue()
            egress_queue = manager.get_egress_web_queue()
            logger.info("IPC Connection Established.")
            return True
    except Exception as e:
        logger.error(f"IPC Connection Failed: {e}")
    return False

# Initial Connect
connect_ipc()

# --------------------------------------------------------------------------
# ASYNC RESPONSE HANDLER
# --------------------------------------------------------------------------
response_futures = {} 

def response_listener():
    """Background thread to route IPC responses."""
    logger.info("Response Listener Thread Started")
    while True:
        try:
            if not egress_queue:
                time.sleep(1)
                continue
                
            # Blocking get with timeout allows checking for connection death
            try:
                message = egress_queue.get(timeout=2)
            except Empty:
                continue
            except (EOFError, BrokenPipeError):
                logger.error("IPC Broken Pipe in Listener. Reconnecting...")
                connect_ipc()
                time.sleep(1)
                continue

            correlation_id = message.get('id')
            if correlation_id in response_futures:
                response_futures[correlation_id].put(message)
                
        except Exception as e:
            logger.error(f"Listener Error: {e}")
            time.sleep(1)

# Start listener (Daemon)
threading.Thread(target=response_listener, daemon=True).start()

def send_ipc(target, action, data=None, server_id="cuemu", timeout=5):
    """Sends command to backend with Auto-Reconnect."""
    global ingress_queue
    
    # 1. Check Connection
    if not ingress_queue:
        if not connect_ipc():
            return {"status": "error", "error": "Backend Unavailable"}

    correlation_id = str(uuid.uuid4())
    future_queue = Queue()
    response_futures[correlation_id] = future_queue

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
    except (EOFError, BrokenPipeError):
        logger.warning("IPC Pipe Broken on Send. Reconnecting and Retrying...")
        connect_ipc()
        try:
            if ingress_queue:
                ingress_queue.put(packet)
                return future_queue.get(timeout=timeout)
        except:
            pass
        return {"status": "error", "error": "Backend Connection Lost"}
    except Empty:
        return {"status": "error", "error": "Backend Timeout"}
    except Exception as e:
        return {"status": "error", "error": str(e)}
    finally:
        if correlation_id in response_futures:
            del response_futures[correlation_id]

# --------------------------------------------------------------------------
# ROUTES
# --------------------------------------------------------------------------

@app.route('/')
def index():
    return render_template("index.html")

@app.route('/login')
def login():
    import urllib.parse
    scope = "identify"
    encoded_redirect = urllib.parse.quote(DISCORD_REDIRECT_URI, safe='')
    discord_url = (
        f"{DISCORD_API_URL}/oauth2/authorize?client_id={DISCORD_CLIENT_ID}"
        f"&redirect_uri={encoded_redirect}&response_type=code&scope={scope}"
    )
    return redirect(discord_url)

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
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    
    try:
        token_resp = requests.post(f"{DISCORD_API_URL}/oauth2/token", data=data, headers=headers)
        token_resp.raise_for_status()
        access_token = token_resp.json()['access_token']

        user_resp = requests.get(f"{DISCORD_API_URL}/users/@me", headers={"Authorization": f"Bearer {access_token}"})
        user_resp.raise_for_status()
        user_data = user_resp.json()

        # Sync User
        resp = send_ipc("validation", "sync_user", data=user_data)
        
        is_superadmin = False
        if resp.get('status') == 'success' and resp.get('data'):
            rows = resp['data']
            if rows and len(rows) > 0:
                is_superadmin = rows[0].get('is_superadmin', False)
        
        perm_resp = send_ipc("validation", "get_user_perms", data={'discord_id': user_data["id"]})
        server_perms = {}
        if perm_resp.get('status') == 'success':
            server_perms = perm_resp.get('data', {}).get('perms', {}) # Fix unpacking structure

        session['discord_id'] = user_data['id']
        session['username'] = user_data['username']
        session['avatar'] = user_data['avatar']
        session['is_superadmin'] = is_superadmin
        session['server_perms'] = server_perms

        return redirect(url_for('index'))

    except Exception as e:
        logger.error(f"Login Error: {e}")
        return f"Login Failed: {e}", 500

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

@app.route('/api/me')
def get_current_user():
    if 'discord_id' not in session:
        return jsonify({"authenticated": False})
    
    # Try Live Fetch
    perm_resp = send_ipc("validation", "get_user_perms", data={'discord_id': session['discord_id']}, timeout=2)
    
    # FALLBACK STRATEGY: Use Session Data if Backend fails
    if perm_resp.get('status') == 'success':
        data = perm_resp.get('data', {})
        server_perms = data.get('perms', {})
        is_superadmin = data.get('is_superadmin', False)
        
        # Update session to keep it fresh
        session['server_perms'] = server_perms
        session['is_superadmin'] = is_superadmin
    else:
        # Backend down/timeout? Use cached session data so UI doesn't break
        logger.warning("Backend Permissions Fetch Failed. Using Session Fallback.")
        server_perms = session.get('server_perms', {})
        is_superadmin = session.get('is_superadmin', False)

    return jsonify({
        "authenticated": True,
        "id": session['discord_id'],
        "username": session['username'],
        "avatar": session['avatar'],
        "is_superadmin": is_superadmin,
        "server_perms": server_perms
    })

@app.route('/api/resource_log', methods=['GET'])
def queryResourceLog():
    server_id = request.args.get('server', 'cuemu')
    since = request.args.get('since', 0)
    
    # CALL NEW LIGHTWEIGHT ENDPOINT
    # Reduced timeout to 5s because it should be fast now
    resp = send_ipc("validation", "get_resource_data", 
                   data={'since': since}, 
                   server_id=server_id, 
                   timeout=5)
    
    if resp['status'] == 'success':
        return jsonify(resp['data']) 
    return jsonify({"error": resp.get('error')}), 500

@app.route('/api/taxonomy', methods=['GET'])
def get_taxonomy():
    # CALL NEW TAXONOMY ENDPOINT
    # Keep 15s timeout because this one is still huge
    resp = send_ipc("validation", "get_taxonomy_data", timeout=15)
    
    if resp['status'] == 'success':
        return jsonify(resp['data'])
    return jsonify({"error": resp.get('error')}), 500

@app.route('/api/add-resource', methods=['POST'])
def add_resource():
    if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    resp = send_ipc("validation", "add_resource", data=data, server_id=data.get('server_id', 'cuemu'))
    if resp['status'] == 'success': return jsonify({"success": True})
    return jsonify({"error": resp.get('error')}), 500

@app.route('/api/update-status', methods=['POST'])
def update_status():
    if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
    resp = send_ipc("validation", "update_status", data=request.json, server_id=request.json.get('server_id', 'cuemu'))
    if resp['status'] == 'success': return jsonify({"success": True})
    return jsonify({"error": resp.get('error')}), 500

@app.route('/api/update-resource', methods=['POST'])
def update_resource():
    if 'discord_id' not in session: return jsonify({"error": "Unauthorized"}), 401
    resp = send_ipc("validation", "update_resource", data=request.json)
    if resp['status'] == 'success': return jsonify({"success": True})
    return jsonify({"error": resp.get('error')}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)