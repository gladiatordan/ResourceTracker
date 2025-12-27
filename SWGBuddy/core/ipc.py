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
_ingress_queue = Queue()      # Web/Bot -> Backend
_egress_web_queue = Queue()   # Backend -> Web
_egress_bot_queue = Queue()   # Backend -> Bot

# --------------------------------------------------------------------------
# HOST FUNCTIONS (Used by MainProcess AND Registered for IPC)
# --------------------------------------------------------------------------

def get_ingress_queue():
    """Returns the raw Ingress Queue"""
    return _ingress_queue

def get_egress_web_queue():
    """Returns the raw Web Egress Queue"""
    return _egress_web_queue

def get_egress_bot_queue():
    """Returns the raw Bot Egress Queue"""
    return _egress_bot_queue

# --------------------------------------------------------------------------
# MANAGER REGISTRATION (Exposes Queues to Clients)
# --------------------------------------------------------------------------

# FIX: Use the named functions directly, NOT lambdas
IPCManager.register('get_ingress_queue', callable=get_ingress_queue)
IPCManager.register('get_egress_web_queue', callable=get_egress_web_queue)
IPCManager.register('get_egress_bot_queue', callable=get_egress_bot_queue)

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
    # Register stubs for the client side
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