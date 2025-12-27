import uuid
import threading
import logging
from queue import Queue, Empty
from flask import Flask, jsonify, request, render_template
from flask_cors import CORS

# Local Imports
from SWGBuddy.core.ipc import get_client, create_packet

app = Flask(__name__)
CORS(app)

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
    # In production, we might want to exit, but for now we let it run 
    # so we can see the error on the webpage if needed.
    ingress_queue = None
    egress_queue = None
else:
    logger.info("IPC Connection Established.")
    ingress_queue = ipc_manager.get_ingress_queue()
    egress_queue = ipc_manager.get_egress_web_queue()

# --------------------------------------------------------------------------
# ASYNC RESPONSE HANDLER
# --------------------------------------------------------------------------
# Maps Correlation ID -> Queue to wake up the waiting HTTP request
response_futures = {} 

def response_listener():
    """
    Background thread that consumes ALL messages from the Backend
    and routes them to the specific waiting HTTP request.
    """
    logger.info("Response Listener Thread Started")
    while True:
        try:
            # Blocking get to save CPU
            message = egress_queue.get()
            correlation_id = message.get('id')
            
            if correlation_id in response_futures:
                # Wake up the waiting request
                response_futures[correlation_id].put(message)
            else:
                logger.warning(f"Received orphaned response: {correlation_id}")
                
        except Exception as e:
            logger.error(f"Listener Error: {e}")

# Start the listener immediately
if egress_queue:
    listener_thread = threading.Thread(target=response_listener, daemon=True)
    listener_thread.start()

def send_command_and_wait(target, action, data=None, server_id="cuemu", timeout=5):
    """
    Helper to send IPC command and block until response arrives.
    """
    if not ingress_queue:
        return {"status": "error", "error": "Backend Unavailable"}

    # 1. Generate ID and Future
    correlation_id = str(uuid.uuid4())
    future_queue = Queue()
    response_futures[correlation_id] = future_queue

    # 2. Send Packet
    packet = create_packet(
        target=target,
        action=action,
        data=data,
        server_id=server_id,
        user_context={"id": "guest", "role": "admin"} # TODO: Add Real Auth
    )
    packet['id'] = correlation_id # Override with UUID
    
    try:
        ingress_queue.put(packet)
        
        # 3. Wait for Response
        response = future_queue.get(timeout=timeout)
        return response
        
    except Empty:
        return {"status": "error", "error": "Backend Timeout"}
    except Exception as e:
        return {"status": "error", "error": str(e)}
    finally:
        # Cleanup memory
        if correlation_id in response_futures:
            del response_futures[correlation_id]

# --------------------------------------------------------------------------
# ROUTES
# --------------------------------------------------------------------------

@app.route('/')
def index():
    return render_template("index.html")

@app.route('/api/resource_log', methods=['GET'])
def queryResourceLog():
    # Example: "get_init_data" returns {taxonomy, servers, resources}
    # For compatibility with legacy frontend, we extract just the resources list
    
    server_id = request.args.get('server', 'cuemu')
    
    resp = send_command_and_wait("validation", "get_init_data", server_id=server_id)
    
    if resp['status'] == 'success':
        # Transformation: The frontend expects a list of resources. 
        # The backend sends {resources: [...], taxonomy: {...}}
        # We can eventually send it all, but for now let's just send resources 
        # to keep the frontend JS happy.
        return jsonify(resp['data']['resources'])
    else:
        return jsonify({"error": resp.get('error')}), 500

@app.route('/api/taxonomy', methods=['GET'])
def get_taxonomy():
    # New Route: Fetches taxonomy from Backend RAM (Fast!)
    resp = send_command_and_wait("validation", "get_init_data")
    if resp['status'] == 'success':
        # Convert Dictionary format back to List if frontend expects array
        # Backend: {1: {data}, 2: {data}}
        # Frontend: [{data}, {data}]
        tax_dict = resp['data']['taxonomy']
        tax_list = list(tax_dict.values())
        return jsonify(tax_list)
    return jsonify({"error": resp.get('error')}), 500

@app.route('/api/update-status', methods=['POST'])
def update_status():
    data = request.json
    resp = send_command_and_wait("validation", "update_status", data=data)
    if resp['status'] == 'success':
        return jsonify({"success": True})
    return jsonify({"error": resp.get('error')}), 500

@app.route('/api/update-resource', methods=['POST'])
def update_resource():
    data = request.json
    resp = send_command_and_wait("validation", "update_resource", data=data)
    if resp['status'] == 'success':
        return jsonify({"success": True})
    return jsonify({"error": resp.get('error')}), 500

# NOTE: You mentioned 'Add Resource' logic. 
# You will need to make sure your frontend POSTs to a route we handle here.
# Assuming you might add this later or it uses 'update-resource' logic?

if __name__ == '__main__':
    # Debug Mode
    app.run(debug=True, port=5000)