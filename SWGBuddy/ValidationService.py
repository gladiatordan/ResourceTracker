"""
Validation Service Module

Acts as the central logic core and In-Memory Cache (CQRS Read Layer).
Validates all incoming write commands before sending them to the Database.

"""
import time
import threading
from queue import Queue, Empty

# Local Imports
from core.core import Core
from core.ipc import create_packet

class ValidationService(Core):
    def __init__(self, input_queue, db_queue, web_out_queue, bot_out_queue):
        super().__init__()
        self.input_queue = input_queue   # Commands from Router (Web/Bot)
        self.db_queue = db_queue         # To send SQL to DB
        self.web_out_queue = web_out_queue # To reply to Web
        self.bot_out_queue = bot_out_queue # To notify Bot
        
        self.running = True
        
        # In-Memory Caches
        self.taxonomy = {}       # { 'swg_index': {data} }
        self.server_registry = {} # { 'cuemu': {active: True} }
        self.permissions = {}    # { 'discord_id': {'server_id': 'role'} }
        self.active_resources = {} # { 'cuemu': [list of resources], 'legends': [...] }

    def start(self):
        """
        Main entry point. Loads cache and starts worker.
        """
        self.info("Initializing Validation Service...")
        
        # 1. Block until we fetch initial data from DB
        if not self._hydrate_cache():
            self.critical("Failed to hydrate cache. Service cannot start.")
            return

        self.info("Cache Hydrated. Starting Worker Loop...")
        worker_thread = threading.Thread(target=self._worker_loop)
        worker_thread.start()

    def _hydrate_cache(self):
        """
        Fetches Taxonomy, Servers, and Permissions from DB on startup.
        Uses a temporary queue to wait for DB responses synchronously.
        """
        self.info("Hydrating Cache from Database...")
        temp_reply_queue = Queue()
        
        queries = [
            ("servers", "SELECT * FROM game_servers"),
            ("taxonomy", "SELECT * FROM resource_taxonomy"),
            ("permissions", "SELECT * FROM server_permissions"),
            ("resources", "SELECT * FROM resource_spawns WHERE is_active = TRUE")
        ]

        for key, sql in queries:
            # Send Query
            msg = {
                "id": f"init_{key}",
                "action": "query",
                "sql": sql,
                "reply_to": temp_reply_queue
            }
            self.db_queue.put(msg)
            
            # Wait for Response (Blocking)
            try:
                response = temp_reply_queue.get(timeout=5)
                if response['status'] == 'error':
                    self.error(f"DB Error loading {key}: {response['error']}")
                    return False
                
                # Process Data
                self._load_data_into_cache(key, response['data'])
                
            except Empty:
                self.critical(f"Timeout waiting for DB to load {key}")
                return False
        
        return True

    def _load_data_into_cache(self, key, rows):
        """
        Organizes raw DB rows into efficient dictionaries.
        """
        if key == "servers":
            self.server_registry = {r['id']: r for r in rows}
            # Initialize resource buckets for each server
            for s_id in self.server_registry:
                self.active_resources[s_id] = []
                
        elif key == "taxonomy":
            self.taxonomy = {r['swg_index']: r for r in rows}
            
        elif key == "permissions":
            for r in rows:
                uid = r['user_id']
                if uid not in self.permissions:
                    self.permissions[uid] = {}
                self.permissions[uid][r['server_id']] = r['role']
                
        elif key == "resources":
            # Sort resources into their server buckets
            for r in rows:
                sid = r.get('server_id', 'cuemu') # Default fallback
                if sid in self.active_resources:
                    self.active_resources[sid].append(r)

    def _worker_loop(self):
        while self.running:
            try:
                message = self.input_queue.get(timeout=2)
            except:
                continue

            if message:
                self._process_command(message)

    def _process_command(self, packet):
        """
        Routes commands:
        - "get_resources" -> Returns RAM Cache (Fast)
        - "add_resource" -> Validates -> Sends to DB
        """
        target = packet.get('target') # Should be 'validation'
        action = packet.get('action')
        server_id = packet.get('server_id')
        user_ctx = packet.get('user_context') # {id, role}
        payload = packet.get('payload')
        correlation_id = packet.get('id')

        # 1. Handle Read Requests (No Auth needed usually)
        if action == "get_init_data":
            # Return cached Taxonomy + Planets + Resources for that server
            response_data = {
                "taxonomy": self.taxonomy,
                "servers": self.server_registry,
                "resources": self.active_resources.get(server_id, [])
            }
            self._reply_web(correlation_id, "success", response_data)
            return

        # 2. Handle Write Requests (Auth Required)
        if action == "add_resource":
            # A. Permission Check
            if not self._check_permission(user_ctx, server_id, "EDITOR"):
                self._reply_web(correlation_id, "error", None, "Permission Denied")
                return

            # B. Validation Check
            is_valid, err_msg = self._validate_resource(payload)
            if not is_valid:
                self._reply_web(correlation_id, "error", None, err_msg)
                return

            # C. Generate SQL & Send to DB
            sql = self._generate_insert_sql(payload, server_id)
            db_packet = {
                "id": correlation_id, # Pass through ID so DB confirms this specific action
                "action": "execute",
                "sql": sql[0],
                "params": sql[1],
                "reply_to": self.web_out_queue # DB replies directly to Web for final confirmation
                # Note: In a robust system, DB should reply to US, and we update cache.
                # For MVP: We will update our cache optimistically or trigger a re-fetch.
            }
            self.db_queue.put(db_packet)
            
            # D. Optimistic Cache Update (Or notify Bot)
            # We'll send a signal to the Bot immediately
            bot_packet = create_packet("bot", "new_resource", payload, server_id)
            self.bot_out_queue.put(bot_packet)

    def _check_permission(self, user_ctx, server_id, required_role):
        """
        Verifies if user has the role for this specific server.
        """
        if not user_ctx: return False
        uid = user_ctx.get('id')
        
        # Check Global Admin
        if user_ctx.get('global_role') == 'ADMIN':
            return True
            
        # Check Scoped Role
        user_perms = self.permissions.get(uid, {})
        role = user_perms.get(server_id)
        
        return role == required_role or role == 'MODERATOR'

    def _validate_resource(self, data):
        """
        Checks 1-1000 limits, valid stats for the class, etc.
        """
        # 1. Check Stats Range
        stats = ['res_oq', 'res_cd', 'res_dr', 'res_fl', 'res_hr', 'res_ma', 'res_pe', 'res_sr', 'res_ut']
        for s in stats:
            val = data.get(s)
            if val is not None:
                try:
                    ival = int(val)
                    if ival < 1 or ival > 1000:
                        return False, f"Stat {s} must be between 1 and 1000"
                except:
                    return False, f"Stat {s} must be a number"
        
        # 2. Check Class ID exists
        if data.get('resource_class_id') not in self.taxonomy:
             return False, "Invalid Resource Class ID"

        return True, None

    def _generate_insert_sql(self, data, server_id):
        # Simplified SQL Generation
        cols = ["resource_class_id", "name", "server_id", "res_oq", "res_cd", "res_dr", "res_fl", "res_hr", "res_ma", "res_pe", "res_sr", "res_ut"]
        vals = [data.get(c) for c in cols if c != "server_id"]
        vals.insert(2, server_id) # Inject server_id
        
        placeholders = ",".join(["%s"] * len(cols))
        sql = f"INSERT INTO resource_spawns ({','.join(cols)}) VALUES ({placeholders})"
        return sql, tuple(vals)

    def _reply_web(self, corr_id, status, data=None, error=None):
        response = {
            "id": corr_id,
            "status": status,
            "data": data,
            "error": error
        }
        self.web_out_queue.put(response)

    def stop(self):
        self.running = False
        self.info("Validation Service Shutdown.")