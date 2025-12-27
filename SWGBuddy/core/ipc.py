"""

IPC Manager Module

Handles the high-speed Unix Domain Socket bridge between Gunicorn (Frontend) 
and MainProcess (Backend).

"""
import time
from multiprocessing.managers import BaseManager
from queue import Queue

# Configuration
SOCKET_PATH = '/tmp/swgbuddy.sock'
AUTH_KEY = b'swgbuddy_ipc_secret'  # Internal local-only auth

class IPCManager(BaseManager):
    pass

# Global Queues (Hosted by MainProcess)
# We use standard Queue here because the Manager process mediates all access,
# making it thread-safe and process-safe for connected clients.
_ingress_queue = Queue()      # Web/Bot -> Backend
_egress_web_queue = Queue()   # Backend -> Web
_egress_bot_queue = Queue()   # Backend -> Bot

# --------------------------------------------------------------------------
# HOST FUNCTIONS (Used by MainProcess)
# --------------------------------------------------------------------------

def get_ingress_queue():
    """Returns the raw Ingress Queue (for MainProcess usage)"""
    return _ingress_queue

def get_egress_web_queue():
    """Returns the raw Web Egress Queue (for MainProcess usage)"""
    return _egress_web_queue

def get_egress_bot_queue():
    """Returns the raw Bot Egress Queue (for MainProcess usage)"""
    return _egress_bot_queue

# --------------------------------------------------------------------------
# MANAGER REGISTRATION (Exposes Queues to Clients)
# --------------------------------------------------------------------------

# Register the queues so they can be shared via the socket
IPCManager.register('get_ingress_queue', callable=lambda: _ingress_queue)
IPCManager.register('get_egress_web_queue', callable=lambda: _egress_web_queue)
IPCManager.register('get_egress_bot_queue', callable=lambda: _egress_bot_queue)

def get_server():
    """
    Called ONLY by MainProcess.
    Creates and binds the Unix Socket.
    """
    manager = IPCManager(address=SOCKET_PATH, authkey=AUTH_KEY)
    return manager

def get_client():
    """
    Called by Gunicorn Workers, WebServer, and Child Processes.
    Connects to the existing Unix Socket.
    """
    # Register stubs for the client side so they know these methods exist
    IPCManager.register('get_ingress_queue')
    IPCManager.register('get_egress_web_queue')
    IPCManager.register('get_egress_bot_queue')

    manager = IPCManager(address=SOCKET_PATH, authkey=AUTH_KEY)
    try:
        manager.connect()
        return manager
    except FileNotFoundError:
        print(f"IPC Error: Socket {SOCKET_PATH} not found. Is MainProcess running?")
        return None
    except ConnectionRefusedError:
        print("IPC Error: Connection refused. MainProcess might be starting up.")
        return None

def create_packet(target, action, data=None, server_id="cuemu", user_context=None):
    """
    Standardized IPC Message Packet helper
    """
    return {
        "id": str(time.time()), 
        "target": target,       # e.g., 'validation', 'db', 'bot'
        "action": action,       # e.g., 'add_resource'
        "server_id": server_id, # e.g., 'cuemu'
        "user_context": user_context, # {'id': '123', 'role': 'admin'}
        "payload": data or {}
    }