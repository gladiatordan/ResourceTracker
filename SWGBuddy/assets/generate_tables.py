import csv
import json
import re

INPUT_FILE = "resource_taxonomy_table" # Adjust path if needed
OUTPUT_FILE = "resource_taxonomy.json"

# --------------------------------------------------------------------------
# CONFIGURATION
# --------------------------------------------------------------------------

STAT_MAP = {
	"res_quality": "res_oq", "res_decay_resist": "res_dr", "res_flavor": "res_fl",
	"res_potential_energy": "res_pe", "res_malleability": "res_ma", "res_toughness": "res_ut",
	"res_shock_resistance": "res_sr", "res_cold_resist": "res_cr", "res_heat_resist": "res_hr",
	"res_conductivity": "res_cd", "entangle_resistance": "res_er"
}

STANDARD_PLANETS = [
	"Corellia", "Dantooine", "Dathomir", "Endor", "Lok", 
	"Naboo", "Rori", "Talus", "Tatooine", "Yavin"
]

def clean_str(s):
	if not s: return ""
	return s.strip().strip('"').strip("'").replace("  ", " ")

def get_planet_list(label):
	found = []
	for p in STANDARD_PLANETS:
		if p in label: found.append(p)
	if "Kashyyykian" in label: found.append("Kashyyyk")
	if "Mustafarian" in label: found.append("Mustafar")
	if not found: return STANDARD_PLANETS.copy()
	return found

def main():
	print(f"Reading {INPUT_FILE}...")
	rows = []
	try:
		with open(INPUT_FILE, 'r', encoding='utf-8') as f:
			reader = csv.DictReader(f, delimiter='\t')
			for row in reader:
				rows.append(row)
	except FileNotFoundError:
		print(f"Error: {INPUT_FILE} not found.")
		return

	# 1. Identify Parents (to exclude them from being 'valid' spawnable types)
	parent_ids = set()
	for row in rows:
		p_id = clean_str(row.get('parent_id'))
		if p_id and p_id != '0':
			parent_ids.add(p_id)

	# 2. Build Nodes
	nodes = {}
	for row in rows:
		r_id = row['id']
		p_id = clean_str(row.get('parent_id'))
		label = clean_str(row.get('class_label'))
		enum = clean_str(row.get('enum_name'))
		
		# --- VALIDITY CHECK ---
		is_valid = True
		stats_obj = {}
		
		# Rule A: No Parents
		if r_id in parent_ids: is_valid = False
		# Rule B: No Space
		if "space_" in enum.lower(): is_valid = False
		
		for i in range(1, 12):
			col_name = clean_str(row.get(f"attr_{i}"))
			if col_name:
				min_val = int(row.get(f"att_{i}_min") or 0)
				max_val = int(row.get(f"att_{i}_max") or 0)
				stat_code = STAT_MAP.get(col_name, col_name)
				stats_obj[stat_code] = {"min": min_val, "max": max_val}
		
		# Rule C: Check Stats (Exclude Recycled)
		if is_valid:
			has_stats = False
			is_recycled = True
			
			for i in range(1, 12):
				col_name = clean_str(row.get(f"attr_{i}"))
				if col_name:
					min_val = int(row.get(f"att_{i}_min") or 0)
					max_val = int(row.get(f"att_{i}_max") or 0)
					
					if min_val != 200 and max_val != 200:
						is_recycled = False
					
					stat_code = STAT_MAP.get(col_name, col_name)
					stats_obj[stat_code] = {"min": min_val, "max": max_val}
			
			# Invalid if it has stats but they are all recycled (200-200)
			if has_stats and is_recycled:
				is_valid = False

		# Construct Node
		nodes[r_id] = {
			"id": r_id,
			"label": label,
			"is_valid": is_valid,
			"stats": stats_obj,
			"children": [],
			"parent_id": p_id
		}

		# Only attach heavy data if valid
		if is_valid:
			nodes[r_id]["planets"] = get_planet_list(label)

	# 3. Build Tree
	forest = []
	for r_id, node in nodes.items():
		p_id = node.pop('parent_id') # Cleanup
		
		if p_id and p_id in nodes:
			nodes[p_id]['children'].append(node)
		else:
			forest.append(node)

	# 4. Sort Recursively
	def sort_tree(node_list):
		node_list.sort(key=lambda x: x['label'])
		for node in node_list:
			sort_tree(node['children'])

	sort_tree(forest)

	with open(OUTPUT_FILE, 'w') as f:
		json.dump(forest, f, indent=4)
	print(f"Saved {OUTPUT_FILE} - Single Source of Truth")

if __name__ == "__main__":
	main()