"""
Database Service Module
Acts as the exclusive gatekeeper for the PostgreSQL database.
Manages connection pooling and executes queries for other services.
"""
import os
import time
import threading
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor

# Local Imports
from core.core import Core

class DatabaseService(Core):
    def __init__(self, input_queue, output_queue):
        super().__init__()
        self.input_queue = input_queue
        self.output_queue = output_queue
        self.pool = None
        self.running = True
        
        # Load Config from Environment (Zero Trust)
        self.db_config = {
            "host": os.getenv("SWG_DB_HOST", "127.0.0.1"),
            "database": os.getenv("SWG_DB_NAME", "swgbuddy"),
            "user": os.getenv("SWG_DB_USER", "swgbuddy_service"),
            "password": None, # Unused due to mTLS
            "sslmode": "verify-full",
            "sslrootcert": os.getenv("SWG_SSL_ROOT_CERT"),
            "sslcert": os.getenv("SWG_SSL_CLIENT_CERT"),
            "sslkey": os.getenv("SWG_SSL_CLIENT_KEY"),
        }

    def start(self):
        self.info("Initializing Database Service...")
        try:
            self._init_pool()
        except Exception as e:
            self.critical(f"Failed to initialize Database Pool: {e}")
            return

        self.info("Database Pool Ready. Starting Worker Loop...")
        worker_thread = threading.Thread(target=self._worker_loop)
        worker_thread.start()

    def _init_pool(self):
        self.pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=10,
            cursor_factory=RealDictCursor,
            **self.db_config
        )

    def _worker_loop(self):
        while self.running:
            try:
                message = self.input_queue.get(timeout=2)
            except:
                continue

            if message:
                self._process_message(message)

    def _process_message(self, message):
        request_id = message.get('id')
        action = message.get('action')
        sql = message.get('sql')
        params = message.get('params', ())
        reply_queue = message.get('reply_to')

        self.debug(f"Processing DB Request {request_id}: {action}")

        result = None
        error = None

        try:
            conn = self.pool.getconn()
            try:
                with conn.cursor() as cur:
                    cur.execute(sql, params)
                    
                    if action == 'query':
                        # Read-only (No commit)
                        result = cur.fetchall()
                    
                    elif action == 'execute':
                        # Write (Commit, return count)
                        conn.commit()
                        result = {"affected_rows": cur.rowcount}
                    
                    elif action == 'execute_fetch':
                        # Write + Read (Commit AND Return data)
                        # Useful for INSERT ... RETURNING
                        result = cur.fetchall()
                        conn.commit()
                        
            except Exception as e:
                conn.rollback()
                error = str(e)
                self.error(f"SQL Error in {request_id}: {e}")
            finally:
                self.pool.putconn(conn)

        except Exception as pool_error:
            error = f"Connection Pool Error: {pool_error}"
            self.critical(error)

        if reply_queue:
            response = {
                "id": request_id,
                "status": "error" if error else "success",
                "data": result,
                "error": error
            }
            reply_queue.put(response)

    def stop(self):
        self.running = False
        if self.pool:
            self.pool.closeall()
        self.info("Database Service Shutdown Complete.")