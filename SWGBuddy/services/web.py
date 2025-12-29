"""
SWGBuddy WebService Module

Wrapper to run the Flask Frontend as a ServiceManager Process.

"""
import sys
import os
import threading

# Ensure root directory is in path
sys.path.append(os.getcwd())

from ..core.core import Core
from ..core.database import DatabaseContext
from app import app, start_response_router

class WebService(Core):
    def __init__(self, validation_queue, log_queue, reply_queue):
        super().__init__(log_queue)
        self.val_queue = validation_queue
        self.reply_queue = reply_queue

    def run(self):
        # 1. Inject Queues into Flask Config so app.py can use them
        app.config['VAL_QUEUE'] = self.val_queue
        app.config['LOG_QUEUE'] = self.log_queue
        app.config['REPLY_QUEUE'] = self.reply_queue
        
        # 2. Start the Response Router Thread (Defined in app.py)
        # This listens for "Success/Fail" messages from ValidationService
        start_response_router(self.reply_queue)

        # 3. Initialize DB Connection Pool for this process
        DatabaseContext.initialize()

        self.info("Starting Flask Web Server on port 5000...")
        
        # 4. Run Flask
        # use_reloader=False is CRITICAL when using multiprocessing
        # otherwise Flask spawns a child process that confuses the Manager
        app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)