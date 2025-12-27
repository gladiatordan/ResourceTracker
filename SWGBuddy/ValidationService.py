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
    # DEFINE THE HIERARCHY OF POWER
    ROLE_HIERARCHY = {
        'SUPERADMIN': 100, # God Mode
        'ADMIN': 3,        # Server Manager (Delete, Manage Users)
        'EDITOR': 2,       # Content Creator (Add/Edit Resources)
        'USER': 1,         # Viewer (Read Only)
        'GUEST': 0         # No Access
    }

    def __init__(self, input_queue, db_queue, web_out_queue, bot_out_queue):
        super().__init__()
        self.input_queue = input_queue   
        self.db_queue = db_queue         
        self.web_out_queue = web_out_queue 
        self.bot_out_queue = bot_out_queue 
        
        self.running = True
        
        # In-Memory Caches
        self.taxonomy = {}       # { swg_index (int): {data} }
        self.valid_resource_types = set() 
        self.server_registry = {} 
        self.permissions = {}    # { 'discord_id': {'server_id': 'role_string'} }
        self.active_resources = {} 

        self.stat_map = {
            'res_oq': 'OQ', 'res_cd': 'CD', 'res_dr': 'DR', 
            'res_fl': 'FL', 'res_hr': 'HR', 'res_ma': 'MA', 
            'res_pe': 'PE', 'res_sr': 'SR', 'res_ut': 'UT', 'res_cr': 'CR'
        }

    def start(self):
        self.info("Initializing Validation Service...")
        if not self._hydrate_cache():
            self.critical("Failed to hydrate cache. Service cannot start.")
            return
        self.info("Cache Hydrated. Starting Worker Loop...")
        worker_thread = threading.Thread(target=self._worker_loop)
        worker_thread.start()

    def _hydrate_cache(self):
        self.info("Hydrating Cache from Database...")
        temp_reply_queue = Queue()
        
        queries = [
            ("servers", "SELECT * FROM game_servers"),
            ("taxonomy", "SELECT * FROM resource_taxonomy"),
            ("permissions", "SELECT * FROM server_permissions"),
            ("resources", "SELECT * FROM resource_spawns WHERE is_active = TRUE")
        ]

        for key, sql in queries:
            msg = {"id": f"init_{key}", "action": "query", "sql": sql, "reply_to": temp_reply_queue}
            self.db_queue.put(msg)
            try:
                response = temp_reply_queue.get(timeout=5)
                if response['status'] == 'error':
                    self.error(f"DB Error loading {key}: {response['error']}")
                    return False
                self._load_data_into_cache(key, response['data'])
            except Empty:
                self.critical(f"Timeout waiting for DB to load {key}")
                return False
        
        self._build_validity_cache()
        return True

    def _load_data_into_cache(self, key, rows):
        if key == "servers":
            self.server_registry = {r['id']: r for r in rows}
            for s_id in self.server_registry:
                self.active_resources[s_id] = []
        elif key == "taxonomy":
            self.taxonomy = {r['swg_index']: r for r in rows}
        elif key == "permissions":
            self.permissions = {} # Reset to ensure clean reload
            for r in rows:
                uid = r['user_id']
                if uid not in self.permissions:
                    self.permissions[uid] = {}
                self.permissions[uid][r['server_id']] = r['role']
        elif key == "resources":
            self.active_resources = {s_id: [] for s_id in self.server_registry}
            for r in rows:
                sid = r.get('server_id', 'cuemu') 
                if sid in self.active_resources:
                    self.active_resources[sid].append(r)

    def _build_validity_cache(self):
        self.info("Building Resource Validity Cache...")
        ids_with_children = set()
        for r in self.taxonomy.values():
            pid = r.get('parent_id')
            if pid: ids_with_children.add(pid)
        
        count_valid = 0
        for swg_id, entry in self.taxonomy.items():
            if swg_id in ids_with_children: continue 
            if 'space_' in entry.get('enum_name', '').lower(): continue

            is_recycled = True
            has_any_stats = False
            for i in range(1, 12):
                if entry.get(f'attr_{i}'):
                    has_any_stats = True
                    if entry.get(f'att_{i}_min') != 200 or entry.get(f'att_{i}_max') != 200:
                        is_recycled = False
                        break
            if has_any_stats and is_recycled: continue

            self.valid_resource_types.add(swg_id)
            count_valid += 1
        self.info(f"Validity Cache Built. {count_valid} Valid Types.")

    def _worker_loop(self):
        while self.running:
            try:
                message = self.input_queue.get(timeout=2)
                if message: self._process_command(message)
            except: continue

    # ------------------------------------------------------------------
    # COMMAND PROCESSOR
    # ------------------------------------------------------------------
    def _process_command(self, packet):
        action = packet.get('action')
        server_id = packet.get('server_id')
        user_ctx = packet.get('user_context') 
        payload = packet.get('payload')
        correlation_id = packet.get('id')
        self.info(f"VALIDATION SERVICE: Processing {action}") #
        
        # 1. READ REQUESTS (Now Gated by USER Level)
        if action == "get_init_data":
            # Check for 'USER' (Level 1) or higher
            if not self._check_access(user_ctx, server_id, 'USER'):
                self._reply_web(correlation_id, "error", None, "Access Denied: You do not have permission to view this server.")
                return

            response_data = {
                "taxonomy": self.taxonomy,
                "servers": self.server_registry,
                "resources": self.active_resources.get(server_id, [])
            }
            self._reply_web(correlation_id, "success", response_data)
            return

        # 2. ADD REQUESTS (Gated by EDITOR Level)
        if action == "add_resource":
            if not self._check_access(user_ctx, server_id, 'EDITOR'):
                self._reply_web(correlation_id, "error", None, "Permission Denied: Editor role required.")
                return

            is_valid, err_msg = self._validate_resource(payload)
            if not is_valid:
                self._reply_web(correlation_id, "error", None, err_msg)
                return

            sql, params = self._generate_insert_sql(payload, server_id)
            db_packet = {
                "id": correlation_id, 
                "action": "execute",
                "sql": sql,
                "params": params,
                "reply_to": self.web_out_queue 
            }
            self.db_queue.put(db_packet)
            
            # Optimistic Update: Add to local cache immediately so the user sees it
            # (We would ideally wait for DB confirmation, but this is faster for UI)
            # For now, we wait for next fetch or assume success.
            
            bot_packet = create_packet("bot", "new_resource", payload, server_id)
            self.bot_out_queue.put(bot_packet)
            return

        # 3. USER SYNC (Updated for Roles)
        if action == "sync_user":
            discord_id = payload.get('id')
            username = payload.get('username')
            avatar = payload.get('avatar')

            # Upsert and RETURN the global_role so the webserver can cache it
            sql = """
                INSERT INTO users (discord_id, username, avatar_url, last_login)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (discord_id) DO UPDATE 
                SET username = EXCLUDED.username, 
                    avatar_url = EXCLUDED.avatar_url,
                    last_login = NOW()
                RETURNING global_role
            """
            
            # We use a temporary reply queue inside the service logic 
            # to get the role back from DB immediately (Synchronous-ish)
            # But since we are inside the Worker Loop, we can't easily block on the DB Service 
            # without stalling the Validation Service. 
            
            # BETTER APPROACH: Send the execute command to DB, 
            # and have the DB reply DIRECTLY to the WebServer with the data.
            
            db_packet = {
                "id": correlation_id, # Re-use the Web's ID so the reply goes to the right waiting request
                "action": "query",    # Change to 'query' so we get the RETURNING data
                "sql": sql,
                "params": (discord_id, username, avatar),
                "reply_to": self.web_out_queue # DB replies to Web directly
            }
            self.db_queue.put(db_packet)
            
            # NOTE: We do NOT send a separate _reply_web here because the DB service 
            # will send the success/data packet directly to the web queue.
            return

    # ------------------------------------------------------------------
    # PERMISSION LOGIC (The New Hierarchy)
    # ------------------------------------------------------------------
    def _get_user_level(self, user_ctx, server_id):
        """Calculates the integer power level of the user for the specific server."""
        if not user_ctx: return 0 # Guest
        
        # 1. Check Global Role
        global_role = user_ctx.get('global_role', 'GUEST')
        global_level = self.ROLE_HIERARCHY.get(global_role, 0)
        
        # If SuperAdmin, they are level 100 everywhere
        if global_level >= 100: return 100
        
        # 2. Check Server-Specific Role
        uid = user_ctx.get('id')
        user_perms = self.permissions.get(uid, {})
        server_role = user_perms.get(server_id, 'GUEST')
        server_level = self.ROLE_HIERARCHY.get(server_role, 0)
        
        # Return the higher of the two (though Global is usually just Registered or SuperAdmin)
        return max(global_level, server_level)

    def _check_access(self, user_ctx, server_id, required_role_name):
        """Returns True if user's level >= required role's level."""
        user_level = self._get_user_level(user_ctx, server_id)
        required_level = self.ROLE_HIERARCHY.get(required_role_name, 100)
        return user_level >= required_level

    # ------------------------------------------------------------------
    # VALIDATION LOGIC
    # ------------------------------------------------------------------
    def _validate_resource(self, data):
        class_id = data.get('resource_class_id')
        if not class_id: return False, "Missing resource_class_id"
        try: class_id = int(class_id)
        except: return False, "Invalid resource_class_id format"

        if class_id not in self.valid_resource_types:
            return False, f"Invalid Resource Type ID: {class_id}"

        tax_entry = self.taxonomy.get(class_id)
        for json_key, attr_code in self.stat_map.items():
            user_val = data.get(json_key)
            if user_val is None or user_val == "": continue
            try: user_val = int(user_val)
            except: return False, f"Stat {json_key} must be a number"

            found_col_index = None
            for i in range(1, 12):
                if tax_entry.get(f'attr_{i}') == attr_code:
                    found_col_index = i
                    break
            
            if found_col_index:
                mn = tax_entry.get(f'att_{found_col_index}_min', 1)
                mx = tax_entry.get(f'att_{found_col_index}_max', 1000)
                if user_val < mn or user_val > mx:
                    return False, f"{attr_code} must be between {mn} and {mx}."
            else:
                if user_val > 0:
                    return False, f"This resource class does not support: {attr_code}"
        return True, None

    def _generate_insert_sql(self, data, server_id):
        allowed_cols = ["resource_class_id", "name", "res_oq", "res_cd", "res_dr", "res_fl", "res_hr", "res_ma", "res_pe", "res_sr", "res_ut", "res_cr", "planet"]
        cols = ["server_id"]
        vals = [server_id]
        for k in allowed_cols:
            if k in data:
                cols.append(k)
                vals.append(data[k])
        placeholders = ",".join(["%s"] * len(cols))
        sql = f"INSERT INTO resource_spawns ({','.join(cols)}) VALUES ({placeholders})"
        return sql, tuple(vals)

    def _reply_web(self, corr_id, status, data=None, error=None):
        self.web_out_queue.put({"id": corr_id, "status": status, "data": data, "error": error})

    def stop(self):
        self.running = False
        self.info("Validation Service Shutdown.")