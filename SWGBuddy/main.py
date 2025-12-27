"""
SWGBuddy Main Process (Backend Orchestrator)
--------------------------------------------
This is the entry point for the Backend Service.
It initializes the IPC Server, starts the microservices, and routes traffic.
"""
import time
import signal
import sys
import threading
import logging
from queue import Queue, Empty

# Local Imports
# FIX 1: Do NOT import get_ingress_queue directly. We need the Manager's version.
from core.ipc import get_server
from DatabaseService import DatabaseService
from ValidationService import ValidationService

# Graceful optional import for Bot
try:
    from DiscordBotService import DiscordBotService
    BOT_AVAILABLE = True
except ImportError:
    BOT_AVAILABLE = False

# Configure Root Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.FileHandler("/opt/swgbuddy/logs/backend.log"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("MainProcess")

class ServiceManager:
    def __init__(self):
        self.running = True
        self.ipc_server = None
        
        # 1. Internal Queues (Service-to-Service communication)
        # These are local to this process and don't need to be shared via IPC
        self.db_queue = Queue()
        self.val_queue = Queue()

        # 2. Start the IPC Manager Server
        # This spawns a separate process that holds the "Real" Shared Queues
        self.ipc_server = get_server()
        self.ipc_server.start()
        
        # 3. CRITICAL FIX: Get Proxies to the Shared Queues
        # We must ask the server for the queues so we are looking at the same memory as app.py
        self.ingress_queue = self.ipc_server.get_ingress_queue()
        self.web_out_queue = self.ipc_server.get_egress_web_queue()
        self.bot_out_queue = self.ipc_server.get_egress_bot_queue()

        # 4. Initialize Services
        self.db_service = DatabaseService(
            input_queue=self.db_queue,
            output_queue=None # DB replies directly to reply_to queues
        )

        self.val_service = ValidationService(
            input_queue=self.val_queue,
            db_queue=self.db_queue,
            web_out_queue=self.web_out_queue,
            bot_out_queue=self.bot_out_queue
        )
        
        if BOT_AVAILABLE:
            self.bot_service = DiscordBotService(
                input_queue=self.bot_out_queue, 
                ingress_queue=self.ingress_queue
            )
        else:
            self.bot_service = None

    def start(self):
        logger.info("Starting SWGBuddy Backend Services...")

        # Start Services
        self.db_service.start()
        self.val_service.start()
        if self.bot_service:
            self.bot_service.start()

        # Start Router Thread
        self.router_thread = threading.Thread(target=self._router_loop)
        self.router_thread.start()
        
        logger.info("Backend Services Running. Listening for IPC commands...")

        # Main Block - Keep alive until signal
        while self.running:
            time.sleep(1)

    def _router_loop(self):
        """
        Consumes messages from the public IPC Ingress Queue and 
        routes them to the correct internal service queue.
        """
        logger.info("Router Loop Started")
        while self.running:
            try:
                # 1. Get Message from Web/Bot
                packet = self.ingress_queue.get(timeout=2)
                
                target = packet.get('target')
                
                # 2. Route Message
                if target == 'validation':
                    self.val_queue.put(packet)
                elif target == 'db':
                    self.db_queue.put(packet)
                else:
                    logger.warning(f"Unknown Target in Packet: {target}")

            except Empty:
                continue
            except Exception as e:
                logger.error(f"Router Error: {e}")

    def stop(self, signum, frame):
        logger.info(f"Signal {signum} received. Initiating Graceful Shutdown...")
        self.running = False
        
        # Stop Services
        if self.val_service: self.val_service.stop()
        if self.db_service: self.db_service.stop()
        if self.bot_service: self.bot_service.stop()
        
        # Stop IPC
        if self.ipc_server:
            self.ipc_server.shutdown()
            
        logger.info("Shutdown Complete. Exiting.")
        sys.exit(0)

if __name__ == "__main__":
    manager = ServiceManager()
    
    # Register Signal Handlers
    signal.signal(signal.SIGTERM, manager.stop)
    signal.signal(signal.SIGINT, manager.stop)

    manager.start()