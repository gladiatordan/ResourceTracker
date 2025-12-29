import csv
import json
import re

INPUT_FILE = "resource_taxonomy_table" # Adjust path if needed
HIERARCHY_FILE = "resource_hierarchy_table.json"
VALID_RES_FILE = "valid_resource_table.json"

# --------------------------------------------------------------------------
# CONFIGURATION
# --------------------------------------------------------------------------

# Map internal DB names to Standard Short Codes
STAT_MAP = {
    "res_quality": "res_oq",
    "res_decay_resist": "res_dr",
    "res_flavor": "res_fl",
    "res_potential_energy": "res_pe",
    "res_malleability": "res_ma",
    "res_toughness": "res_ut",
    "res_shock_resistance": "res_sr",
    "res_cold_resist": "res_cr",
    "res_heat_resist": "res_hr",
    "res_conductivity": "res_cd",
    "entangle_resistance": "res_er"
}

STANDARD_PLANETS = [
    "Corellia", "Dantooine", "Dathomir", "Endor", "Lok", 
    "Naboo", "Rori", "Talus", "Tatooine", "Yavin"
]

def clean_str(s):
    """Removes quotes from CSV/TSV strings."""
    if not s: return ""
    return s.strip().strip('"').strip("'").replace("  ", " ")

def get_planet_list(label):
    """Derives valid planets based on the class label."""
    found = []
    
    # Check Standard Planets
    for p in STANDARD_PLANETS:
        if p in label:
            found.append(p)
            
    # Check Special Planets (Strict Prefix Rule)
    if "Kashyyykian" in label:
        found.append("Kashyyyk")
    if "Mustafarian" in label:
        found.append("Mustafar")
        
    # Default Rule: If empty, all standard planets (No Kash/Must)
    if not found:
        return STANDARD_PLANETS.copy()
        
    return found

def main():
    print(f"Reading {INPUT_FILE}...")
    
    # 1. Read Data
    rows = []
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            # Detect dialect or assume tab
            reader = csv.DictReader(f, delimiter='\t')
            for row in reader:
                rows.append(row)
    except FileNotFoundError:
        print(f"Error: {INPUT_FILE} not found. Please upload or adjust path.")
        return

    # 2. Build Helper Structures
    # We need to know which IDs are parents to filter them from valid_resource_table
    parent_ids = set()
    nodes = {}
    
    for row in rows:
        r_id = row['id']
        p_id = clean_str(row.get('parent_id'))
        
        # Track Parents
        if p_id and p_id != '0':
            parent_ids.add(p_id)
            
        nodes[r_id] = {
            "id": r_id,
            "parent_id": p_id,
            "label": clean_str(row.get('class_label')),
            "enum": clean_str(row.get('enum_name')),
            "raw": row,
            "children": []
        }

    # --------------------------------------------------------------------------
    # GENERATE: resource_hierarchy_table.json
    # --------------------------------------------------------------------------
    print("Building Hierarchy...")
    forest = []
    
    # Link children to parents
    for r_id, node in nodes.items():
        p_id = node['parent_id']
        
        # Create lightweight node for JSON output (only label + children)
        # We keep a reference to 'children' list to populate it dynamically
        tree_node = {"label": node['label'], "children": []}
        node['tree_ref'] = tree_node # Store ref to put in parent
        
        if p_id and p_id in nodes:
            nodes[p_id]['tree_ref']['children'].append(tree_node)
        else:
            # Root Node
            forest.append(tree_node)

    # Recursive Sort function for consistent ordering
    def sort_tree(node_list):
        node_list.sort(key=lambda x: x['label'])
        for node in node_list:
            sort_tree(node['children'])

    sort_tree(forest)

    with open(HIERARCHY_FILE, 'w') as f:
        json.dump(forest, f, indent=4) # Minified for speed
    print(f"Saved {HIERARCHY_FILE}")

    # --------------------------------------------------------------------------
    # GENERATE: valid_resource_table.json
    # --------------------------------------------------------------------------
    print("Building Valid Resource Table...")
    valid_resources = {}

    for r_id, node in nodes.items():
        row = node['raw']
        label = node['label']
        enum = node['enum']
        
        # --- VALIDITY CHECKS ---
        
        # 1. Exclude Space
        if "space_" in enum.lower():
            continue
            
        # 2. Exclude Parents (Classes with children)
        if r_id in parent_ids:
            continue
            
        # 3. Exclude "Recycled" (All stats 200-200)
        # We check active attributes. If ANY active attribute is NOT 200-200, it's valid.
        is_recycled = True
        has_stats = False
        stats_obj = {}
        
        for i in range(1, 12):
            attr_key = f"attr_{i}"
            col_name = clean_str(row.get(attr_key))
            
            if col_name:
                has_stats = True
                min_val = int(row.get(f"att_{i}_min") or 0)
                max_val = int(row.get(f"att_{i}_max") or 0)
                
                # If we find a real range, it's not a recycled resource
                if min_val != 200 or max_val != 200:
                    is_recycled = False
                
                # Map column name to Short Code (e.g. "res_quality" -> "OQ")
                stat_code = STAT_MAP.get(col_name, col_name)
                
                stats_obj[stat_code] = {
                    "min": min_val,
                    "max": max_val
                }

        # Logic: It is invalid ONLY if it has stats AND they are all 200-200.
        # (Some resources might have 0 stats, we assume they are valid unless logic says otherwise)
        if has_stats and is_recycled:
            continue

        # --- CONSTRUCT ENTRY ---
        
        valid_resources[label] = {
            "id": node["id"],
            "stats": stats_obj,
            "planets": get_planet_list(label)
        }

    with open(VALID_RES_FILE, 'w') as f:
        json.dump(valid_resources, f, indent=4)
    print(f"Saved {VALID_RES_FILE} ({len(valid_resources)} entries)")

if __name__ == "__main__":
    main()