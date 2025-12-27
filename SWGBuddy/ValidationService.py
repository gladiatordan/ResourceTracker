"""
Validation Service Module
"""
import time
import threading
from datetime import datetime, timezone
from queue import Queue, Empty

# Local Imports
from core.core import Core
from core.ipc import create_packet

class ValidationService(Core):
    ROLE_HIERARCHY = {'SUPERADMIN': 100, 'ADMIN': 3, 'EDITOR': 2, 'USER': 1, 'GUEST': 0}

    def __init__(self, input_queue, db_queue, web_out_queue, bot_out_queue):
        super().__init__()
        self.input_queue = input_queue   
        self.db_queue = db_queue         
        self.web_out_queue = web_out_queue 
        self.bot_out_queue = bot_out_queue 
        self.running = True
        
        self.taxonomy = {}
        self.valid_resource_types = set() 
        self.server_registry = {} 
        self.permissions = {}    
        self.active_resources = {} 
        self.superadmins = set()

        self.stat_map = {
            'res_oq': 'OQ', 'res_cd': 'CD', 'res_dr': 'DR', 'res_fl': 'FL', 'res_hr': 'HR',
            'res_ma': 'MA', 'res_pe': 'PE', 'res_sr': 'SR', 'res_ut': 'UT', 'res_cr': 'CR'
        }

    def start(self):
        self.info("Initializing Validation Service...")
        if not self._hydrate_cache(full_load=True):
            self.critical("Failed to hydrate cache. Service cannot start.")
            return
        self.info("Cache Hydrated. Starting Worker Loops...")
        threading.Thread(target=self._worker_loop, daemon=True).start()
        threading.Thread(target=self._maintenance_loop, daemon=True).start()

    def _maintenance_loop(self):
        while self.running:
            time.sleep(30)
            try: self._hydrate_cache(full_load=False)
            except Exception as e: self.error(f"Cache Maintenance Failed: {e}")

    def _hydrate_cache(self, full_load=False):
        temp_reply_queue = Queue()
        queries = [
            ("servers", "SELECT * FROM game_servers"),
            ("permissions", "SELECT * FROM server_permissions"),
            ("superadmins", "SELECT discord_id FROM users WHERE is_superadmin = TRUE"),
            ("resources", "SELECT * FROM resource_spawns WHERE is_active = TRUE ORDER BY date_reported DESC")
        ]
        if full_load:
            queries.insert(1, ("taxonomy", "SELECT * FROM resource_taxonomy"))

        for key, sql in queries:
            self.db_queue.put({"id": f"init_{key}", "action": "query", "sql": sql, "reply_to": temp_reply_queue})
            try:
                response = temp_reply_queue.get(timeout=5)
                if response['status'] == 'error':
                    self.error(f"DB Error loading {key}: {response['error']}")
                    return False
                self._load_data_into_cache(key, response['data'])
            except Empty:
                self.error(f"Timeout waiting for DB to load {key}")
                return False
        
        if full_load: self._build_validity_cache()
        return True

    def _load_data_into_cache(self, key, rows):
        if key == "servers":
            self.server_registry = {r['id']: r for r in rows}
            for s_id in self.server_registry:
                if s_id not in self.active_resources: self.active_resources[s_id] = []
        elif key == "taxonomy":
            self.taxonomy = {r['swg_index']: r for r in rows}
        elif key == "superadmins":
            self.superadmins = {r['discord_id'] for r in rows}
        elif key == "permissions":
            self.permissions = {} 
            for r in rows:
                uid = r['user_id']
                if uid not in self.permissions: self.permissions[uid] = {}
                self.permissions[uid][r['server_id']] = r['role']
        elif key == "resources":
            self.active_resources = {s_id: [] for s_id in self.server_registry}
            for r in rows:
                sid = r.get('server_id', 'cuemu') 
                if sid in self.active_resources: self.active_resources[sid].append(r)

    def _build_validity_cache(self):
        ids_with_children = set()
        for r in self.taxonomy.values():
            if r.get('parent_id'): ids_with_children.add(r['parent_id'])
        
        count_valid = 0
        for swg_id, entry in self.taxonomy.items():
            if swg_id in ids_with_children: continue 
            if 'space_' in entry.get('enum_name', '').lower(): continue
            
            # Simple heuristic for recycled resources
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

    def _process_command(self, packet):
        action = packet.get('action')
        server_id = packet.get('server_id')
        user_ctx = packet.get('user_context') 
        payload = packet.get('payload')
        correlation_id = packet.get('id')
        
        # 1. OPTIMIZED READ: RESOURCES ONLY (Lightweight)
        if action == "get_resource_data":
            if not self._check_access(user_ctx, server_id, 'USER'):
                self._reply_web(correlation_id, "error", None, "Access Denied.")
                return

            # Delta Filtering Logic
            since_ts = float(payload.get('since', 0) or 0)
            full_list = self.active_resources.get(server_id, [])
            
            # (Optional: Add actual delta logic here later)
            filtered_resources = full_list 

            response_data = {
                "servers": self.server_registry, # Lightweight enough to send every time
                "resources": filtered_resources
            }
            self._reply_web(correlation_id, "success", response_data)
            return

        # 2. OPTIMIZED READ: TAXONOMY ONLY (Heavy, Cached on Client)
        if action == "get_taxonomy_data":
            # Taxonomy is public/static, usually no strict role check needed, 
            # but we can enforce USER if desired.
            response_data = {
                "taxonomy": self.taxonomy,
                "valid_types": list(self.valid_resource_types)
            }
            self._reply_web(correlation_id, "success", response_data)
            return

        # 3. LEGACY/FALLBACK (The Monolith - Deprecated but kept for safety)
        if action == "get_init_data":
            # ... (Existing logic if you want to keep it, otherwise remove) ...
            pass

        # ... (Keep WRITE, SYNC_USER, and GET_USER_PERMS handlers exactly as they were) ...
        # WRITE
        if action == "add_resource":
            if not self._check_access(user_ctx, server_id, 'EDITOR'):
                self._reply_web(correlation_id, "error", None, "Permission Denied.")
                return

            is_valid, err_msg = self._validate_resource(payload)
            if not is_valid:
                self._reply_web(correlation_id, "error", None, err_msg)
                return

            sql, params = self._generate_insert_sql(payload, server_id)
            self.db_queue.put({"id": correlation_id, "action": "execute", "sql": sql, "params": params, "reply_to": self.web_out_queue})
            self.bot_out_queue.put(create_packet("bot", "new_resource", payload, server_id))
            return

        # SYNC USER
        if action == "sync_user":
            discord_id = payload.get('id')
            username = payload.get('username')
            avatar = payload.get('avatar')
            sql = """
                INSERT INTO users (discord_id, username, avatar_url, last_login)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (discord_id) DO UPDATE 
                SET username = EXCLUDED.username, avatar_url = EXCLUDED.avatar_url, last_login = NOW()
                RETURNING is_superadmin
            """
            self.db_queue.put({
                "id": correlation_id, 
                "action": "execute_fetch", 
                "sql": sql, 
                "params": (discord_id, username, avatar),
                "reply_to": self.web_out_queue
            })
            return

        # GET PERMISSIONS
        if action == "get_user_perms":
            discord_id = payload.get('discord_id')
            active_servers = [s for s in self.server_registry if self.server_registry[s].get('is_active')]
            if discord_id not in self.permissions: self.permissions[discord_id] = {}
            
            new_inserts = []
            for s_id in active_servers:
                if s_id not in self.permissions[discord_id]:
                    self.permissions[discord_id][s_id] = 'USER'
                    new_inserts.append((discord_id, s_id, 'USER'))
            
            if new_inserts:
                vals = ",".join([f"('{u}','{s}','{r}')" for u, s, r in new_inserts])
                self.db_queue.put({"id": f"perm_{discord_id}", "action": "execute", "sql": f"INSERT INTO server_permissions (user_id, server_id, role) VALUES {vals} ON CONFLICT DO NOTHING"})

            response_data = {
                "perms": self.permissions.get(discord_id, {}),
                "is_superadmin": discord_id in self.superadmins
            }
            self._reply_web(correlation_id, "success", response_data)
            return

    # ... (Helpers _get_user_level, _check_access, _validate_resource, _generate_insert_sql etc remain same)
    def _get_user_level(self, user_ctx, server_id):
        if not user_ctx: return 0 
        uid = user_ctx.get('id')
        if uid in self.superadmins: return 100
        user_perms = self.permissions.get(uid, {})
        server_role = user_perms.get(server_id, 'GUEST')
        return self.ROLE_HIERARCHY.get(server_role, 0)

    def _check_access(self, user_ctx, server_id, required_role_name):
        return self._get_user_level(user_ctx, server_id) >= self.ROLE_HIERARCHY.get(required_role_name, 100)

    def _validate_resource(self, data):
        # (Paste previous implementation logic here to ensure validation works)
        class_id = data.get('resource_class_id')
        if not class_id or int(class_id) not in self.valid_resource_types: return False, "Invalid Type"
        
        tax = self.taxonomy.get(int(class_id))
        for key, code in self.stat_map.items():
            val = data.get(key)
            if val is None or val == "": continue
            val = int(val)
            
            found = False
            for i in range(1, 12):
                if tax.get(f'attr_{i}') == code:
                    found = True
                    mn, mx = tax.get(f'att_{i}_min'), tax.get(f'att_{i}_max')
                    if val < mn or val > mx: return False, f"{code} range: {mn}-{mx}"
                    break
            if not found and val > 0: return False, f"Invalid Stat: {code}"
        return True, None

    def _generate_insert_sql(self, data, server_id):
        allowed = ["resource_class_id", "name", "res_oq", "res_cd", "res_dr", "res_fl", "res_hr", "res_ma", "res_pe", "res_sr", "res_ut", "res_cr", "planet"]
        cols, vals = ["server_id"], [server_id]
        for k in allowed:
            if k in data:
                cols.append(k)
                vals.append(data[k])
        sql = f"INSERT INTO resource_spawns ({','.join(cols)}) VALUES ({','.join(['%s']*len(cols))})"
        return sql, tuple(vals)

    def _reply_web(self, corr_id, status, data=None, error=None):
        self.web_out_queue.put({"id": corr_id, "status": status, "data": data, "error": error})

    def stop(self):
        self.running = False