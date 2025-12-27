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
        self.input_queue = input_queue   
        self.db_queue = db_queue         
        self.web_out_queue = web_out_queue 
        self.bot_out_queue = bot_out_queue 
        
        self.running = True
        
        # In-Memory Caches
        self.taxonomy = {}       # { swg_index (int): {data} }
        self.valid_resource_types = set() # Set of allowed swg_indexes (Leafs, Non-Space, Non-Recycled)
        self.server_registry = {} 
        self.permissions = {}    
        self.active_resources = {} 

        # SWG Stat Mapping: Maps Frontend keys to Taxonomy attribute strings
        self.stat_map = {
            'res_oq': 'OQ', 'res_cd': 'CD', 'res_dr': 'DR', 
            'res_fl': 'FL', 'res_hr': 'HR', 'res_ma': 'MA', 
            'res_pe': 'PE', 'res_sr': 'SR', 'res_ut': 'UT', 'res_cr': 'CR'
        }

    def start(self):
        """Main entry point. Loads cache and starts worker."""
        self.info("Initializing Validation Service...")
        
        if not self._hydrate_cache():
            self.critical("Failed to hydrate cache. Service cannot start.")
            return

        self.info("Cache Hydrated. Starting Worker Loop...")
        worker_thread = threading.Thread(target=self._worker_loop)
        worker_thread.start()

    def _hydrate_cache(self):
        """Fetches initial data from DB synchronously."""
        self.info("Hydrating Cache from Database...")
        temp_reply_queue = Queue()
        
        queries = [
            ("servers", "SELECT * FROM game_servers"),
            ("taxonomy", "SELECT * FROM resource_taxonomy"),
            ("permissions", "SELECT * FROM server_permissions"),
            ("resources", "SELECT * FROM resource_spawns WHERE is_active = TRUE")
        ]

        for key, sql in queries:
            msg = {
                "id": f"init_{key}",
                "action": "query",
                "sql": sql,
                "reply_to": temp_reply_queue
            }
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
        
        # After loading raw data, build the derived logic caches
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
            for r in rows:
                uid = r['user_id']
                if uid not in self.permissions:
                    self.permissions[uid] = {}
                self.permissions[uid][r['server_id']] = r['role']
                
        elif key == "resources":
            for r in rows:
                sid = r.get('server_id', 'cuemu') 
                if sid in self.active_resources:
                    self.active_resources[sid].append(r)

    def _build_validity_cache(self):
        """
        Populates self.valid_resource_types based on Business Rules:
        1. Must NOT have children (Leaf Node).
        2. Must NOT be Space (enum_name contains 'space_').
        3. Must NOT be Recycled (All active stats min/max == 200).
        """
        self.info("Building Resource Validity Cache...")
        
        # 1. Identify Parents (Any ID that appears as a parent_id to someone else)
        # If an ID is in this set, it HAS children, so it is INVALID.
        ids_with_children = set()
        for r in self.taxonomy.values():
            pid = r.get('parent_id')
            if pid:
                ids_with_children.add(pid)
        
        count_valid = 0
        for swg_id, entry in self.taxonomy.items():
            # Rule 1: Children Check
            # If this ID is listed as a parent to anyone, it's a category, not a resource.
            if swg_id in ids_with_children:
                continue 

            # Rule 2: Space Check
            enum = entry.get('enum_name', '').lower()
            if 'space_' in enum:
                continue

            # Rule 3: Recycled Check (Garbage resources have all stats fixed at 200)
            is_recycled = True
            has_any_stats = False
            
            for i in range(1, 12):
                # If this column has a stat type (e.g., 'OQ')
                if entry.get(f'attr_{i}'):
                    has_any_stats = True
                    mn = entry.get(f'att_{i}_min')
                    mx = entry.get(f'att_{i}_max')
                    
                    # If ANY stat deviates from 200, it is NOT recycled logic
                    if mn != 200 or mx != 200:
                        is_recycled = False
                        break
            
            # If it has stats, and the loop finished with is_recycled=True, it's garbage.
            if has_any_stats and is_recycled:
                continue

            # If we made it here, it's a valid spawnable type
            self.valid_resource_types.add(swg_id)
            count_valid += 1
            
        self.info(f"Validity Cache Built. {count_valid} Valid Resource Types enabled.")

    def _worker_loop(self):
        while self.running:
            try:
                message = self.input_queue.get(timeout=2)
            except:
                continue
            if message:
                self._process_command(message)

    def _process_command(self, packet):
        action = packet.get('action')
        server_id = packet.get('server_id')
        user_ctx = packet.get('user_context') 
        payload = packet.get('payload')
        correlation_id = packet.get('id')

        # 1. READ REQUESTS
        if action == "get_init_data":
            response_data = {
                "taxonomy": self.taxonomy,
                "servers": self.server_registry,
                "resources": self.active_resources.get(server_id, [])
            }
            self._reply_web(correlation_id, "success", response_data)
            return

        # 2. WRITE REQUESTS
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

            # C. Generate SQL
            sql, params = self._generate_insert_sql(payload, server_id)
            
            # D. Send to DB
            db_packet = {
                "id": correlation_id, 
                "action": "execute",
                "sql": sql,
                "params": params,
                "reply_to": self.web_out_queue 
            }
            self.db_queue.put(db_packet)
            
            # E. Notify Bot
            bot_packet = create_packet("bot", "new_resource", payload, server_id)
            self.bot_out_queue.put(bot_packet)
            return

        # 3. USER SYNC (New Handler)
        if action == "sync_user":
            # Payload contains: {'id', 'username', 'avatar', ...}
            discord_id = payload.get('id')
            username = payload.get('username')
            avatar = payload.get('avatar')

            # We upsert the user into the database so Foreign Keys work later
            sql = """
                INSERT INTO users (discord_id, username, avatar_url, last_login)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (discord_id) DO UPDATE 
                SET username = EXCLUDED.username, 
                    avatar_url = EXCLUDED.avatar_url,
                    last_login = NOW()
            """
            
            # Send to DB
            # We assume success and reply to Web immediately to keep Login fast
            db_packet = {
                "id": f"sync_{correlation_id}", # Internal ID
                "action": "execute",
                "sql": sql,
                "params": (discord_id, username, avatar),
                "reply_to": None # Fire and forget
            }
            self.db_queue.put(db_packet)
            
            self._reply_web(correlation_id, "success", {"msg": "User Synced"})
            return

    def _check_permission(self, user_ctx, server_id, required_role):
        if not user_ctx: return False
        uid = user_ctx.get('id')
        if user_ctx.get('global_role') == 'ADMIN': return True
        
        user_perms = self.permissions.get(uid, {})
        role = user_perms.get(server_id)
        return role == required_role or role == 'MODERATOR'

    def _validate_resource(self, data):
        """
        Deep Validation against Taxonomy Cache.
        """
        # 1. Check Class Existence & Validity
        class_id = data.get('resource_class_id')
        if not class_id:
            return False, "Missing resource_class_id"
        
        try:
            class_id = int(class_id)
        except:
            return False, "Invalid resource_class_id format"

        # Check against our pre-calculated validity set
        if class_id not in self.valid_resource_types:
            # We can provide specific error context if needed, but generic is safer
            return False, f"Invalid Resource Type ID: {class_id} (Category, Space, or Static)"

        tax_entry = self.taxonomy.get(class_id)

        # 2. Check Stats against Taxonomy Limits
        for json_key, attr_code in self.stat_map.items():
            user_val = data.get(json_key)
            
            # If user didn't submit this stat, ignore
            if user_val is None or user_val == "":
                continue

            try:
                user_val = int(user_val)
            except:
                return False, f"Stat {json_key} must be a number"

            # Find which column (attr_1..attr_11) holds this stat (e.g., 'OQ')
            found_col_index = None
            for i in range(1, 12):
                if tax_entry.get(f'attr_{i}') == attr_code:
                    found_col_index = i
                    break
            
            if found_col_index:
                # Get limits
                min_limit = tax_entry.get(f'att_{found_col_index}_min', 1)
                max_limit = tax_entry.get(f'att_{found_col_index}_max', 1000)
                
                if user_val < min_limit or user_val > max_limit:
                    return False, f"{attr_code} must be between {min_limit} and {max_limit} for this resource."
            else:
                # User submitted a stat (e.g., CR) that this resource DOES NOT have
                # Strictly block this per requirements
                if user_val > 0:
                    return False, f"This resource class does not support the stat: {attr_code}"

        return True, None

    def _generate_insert_sql(self, data, server_id):
        # We whitelist columns to prevent SQL injection via keys
        allowed_cols = [
            "resource_class_id", "name", "res_oq", "res_cd", "res_dr", 
            "res_fl", "res_hr", "res_ma", "res_pe", "res_sr", "res_ut", "res_cr",
            "planet" # Note: Schema usually stores planets as TEXT[]
        ]
        
        # Prepare Data
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