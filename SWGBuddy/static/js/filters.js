/**
 * Filtering & Sorting Component
 * Handles the data transformation pipeline.
 */

// Configuration for "Up Arrow" behavior per column type.
// 'asc' = A-Z, 0-9, False-True.
// 'desc' = Z-A, 9-0, True-False.
const SORT_BEHAVIOR = {
	// Name/Type: Up = A-Z (Ascending)
	alpha: 'asc', 
	
	// Stats/Rating: Up = Highest to Lowest (Descending)
	numeric: 'desc',
	
	// Date: Up = Most Recent (Large TS) to Oldest (Small TS) (Descending)
	date: 'desc',
	
	// Status: Up = Active(1) to Inactive(0) (Descending)
	status: 'desc',
	
	// Location: Up = A-Z string representation (Ascending)
	planet: 'asc'
};

// Map column keys to their type behavior
const COLUMN_CONFIG = {
	name: 'alpha',
	type: 'alpha',
	planet: 'planet',
	date_reported: 'date',
	is_active: 'status',
	// All stats default to 'numeric'
};

// Initialize Stack: Date (Up) is Primary, Status (Up) is Secondary
// Stack Order: [Primary, Secondary, ...]
let sortStack = [
	{ key: 'date_reported', mode: 'up' }, 
	{ key: 'is_active', mode: 'up' }
];

// Global Toggle for the Taxonomy Filter Dropdown
window.toggleDropdown = function() {
	const list = document.getElementById('taxonomy-list');
	if (list) list.style.display = (list.style.display === 'block') ? 'none' : 'block';
};

document.addEventListener('click', function(event) {
	const dropdown = document.getElementById('taxonomy-dropdown');
	if (dropdown && !dropdown.contains(event.target)) {
		document.getElementById('taxonomy-list').style.display = 'none';
	}
});

/**
 * Main Pipeline: Data -> Filter -> Sort -> View
 */
function applyAllTableTransforms() {
	// 1. Filter first (Efficiency)
	applyFilters(); 
	
	// 2. Sort the filtered data
	if (sortStack.length > 0) {
		filteredData.sort(multiColumnComparator);
	}

	// 3. Render
	renderPaginatedTable(); 
}

function applyFilters() {
	const searchInput = document.querySelector('.search-input');
	const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
	
	const isRoot = !currentSelectedLabel || currentSelectedLabel === "Resources" || currentSelectedLabel === "All Resources";
	const validLabels = isRoot ? [] : [currentSelectedLabel.toLowerCase(), ...getDescendantLabels(currentSelectedLabel)];

	// Filter raw data into the global filteredData array
	filteredData = rawResourceData.filter(res => {
		const name = (res.name || "").toLowerCase();
		const type = (res.type || "").toLowerCase();
		
		const matchesSearch = name.includes(searchTerm) || type.includes(searchTerm);
		const matchesCategory = isRoot || validLabels.includes(type);
		
		return matchesSearch && matchesCategory;
	});
}

/**
 * Comparator that iterates through the sort stack
 */
function multiColumnComparator(a, b) {
	for (let sort of sortStack) {
		const key = sort.key;
		const mode = sort.mode; // 'up' or 'down'
		
		// Determine value type
		let type = COLUMN_CONFIG[key] || 'numeric';
		
		// Determine Asc/Desc based on Up/Down mode and Type config
		// Up = Default Behavior. Down = Inverted.
		let direction = (mode === 'up') ? SORT_BEHAVIOR[type] : (SORT_BEHAVIOR[type] === 'asc' ? 'desc' : 'asc');

		let valA = a[key];
		let valB = b[key];

		// Normalization
		if (type === 'alpha' || type === 'planet') {
			// Handle Planets (Array -> String) or Strings
			if (Array.isArray(valA)) valA = valA.slice().sort().join(', ');
			if (Array.isArray(valB)) valB = valB.slice().sort().join(', ');
			
			valA = (valA || "").toLowerCase();
			valB = (valB || "").toLowerCase();
			
			if (valA !== valB) {
				return direction === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
			}
		} else {
			// Numeric / Boolean
			// Handle nulls/undefined as -1 (always bottom?) or 0
			const nA = (valA === null || valA === undefined) ? -1 : Number(valA);
			const nB = (valB === null || valB === undefined) ? -1 : Number(valB);
			
			if (nA !== nB) {
				return direction === 'asc' ? (nA - nB) : (nB - nA);
			}
		}
	}
	return 0; // Completely equal
}

function selectCategory(label, displayLabel = null) {
	if (!label) label = "Resources";
	document.querySelector('.dropdown-selected').textContent = displayLabel || label;
	currentSelectedLabel = label;
	document.getElementById('taxonomy-list').style.display = 'none';
	applyAllTableTransforms();
	currentPage = 1;
}

/**
 * Handles the Up -> Down -> Off logic
 */
function toggleSort(key) {
	const idx = sortStack.findIndex(s => s.key === key);
	
	if (idx === -1) {
		// STATE 1: Not Active -> Active UP
		// Add to TOP (Primary)
		sortStack.unshift({ key: key, mode: 'up' });
	} else {
		const current = sortStack[idx];
		if (current.mode === 'up') {
			// STATE 2: UP -> DOWN
			// Maintain position in stack, just flip mode
			current.mode = 'down';
		} else {
			// STATE 3: DOWN -> OFF
			// Remove from stack
			sortStack.splice(idx, 1);
		}
	}

	updateSortVisuals();
	applyAllTableTransforms();
}

function updateSortVisuals() {
	// Clear all visuals
	document.querySelectorAll('.sort-btns span').forEach(el => {
		el.classList.remove('active-up', 'active-down');
	});

	// Apply visuals for ALL active sorts in the stack
	// (Or just primary? Prompt implied "stack". Standard UI usually highlights all involved columns)
	sortStack.forEach((sort, index) => {
		const headerTh = document.querySelector(`th[data-sort="${sort.key}"]`);
		if (headerTh) {
			const upArrow = headerTh.querySelector('.up');
			const downArrow = headerTh.querySelector('.down');
			
			if (sort.mode === 'up' && upArrow) {
				upArrow.classList.add('active-up');
				// Optional: visual indicator of stack priority (1, 2, 3) could go here
			} else if (sort.mode === 'down' && downArrow) {
				downArrow.classList.add('active-down');
			}
		}
	});
}