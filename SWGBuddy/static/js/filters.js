/**
 * Filtering & Sorting Component
 * Handles the data transformation pipeline.
 */

// Initialize Sort Stack with defaults: Status (Active first), then Date (Newest first)
// Note: 'asc' usually maps to Up Arrow.
const columnTypes = {
	name: 'alpha',
	type: 'alpha',
	res_weight_rating: 'numeric',
	res_oq: 'numeric',
	res_cr: 'numeric',
	res_cd: 'numeric',
	res_dr: 'numeric',
	res_fl: 'numeric',
	res_hr: 'numeric',
	res_ma: 'numeric',
	res_pe: 'numeric',
	res_sr: 'numeric',
	res_ut: 'numeric',
	date_reported: 'numeric', 
	is_active: 'numeric'      
};

// Global Toggle for the Taxonomy Filter Dropdown
window.toggleDropdown = function() {
	const list = document.getElementById('taxonomy-list');
	if (list) {
		list.style.display = (list.style.display === 'block') ? 'none' : 'block';
	}
};

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
	const dropdown = document.getElementById('taxonomy-dropdown');
	if (dropdown && !dropdown.contains(event.target)) {
		document.getElementById('taxonomy-list').style.display = 'none';
	}
});

function applyAllTableTransforms() {
	let transformed = [...rawResourceData];

	if (sortStack.length > 0) {
		transformed.sort((a, b) => {
			for (let sort of sortStack) {
				let valA = a[sort.key];
				let valB = b[sort.key];
				const type = columnTypes[sort.key] || 'alpha';

				if (type === 'alpha') {
					valA = (valA || "").toLowerCase();
					valB = (valB || "").toLowerCase();
					if (valA !== valB) {
						return sort.direction === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
					}
				} else {
					valA = (sort.key === 'is_active') ? (valA ? 1 : 0) : (valA ?? -1);
					valB = (sort.key === 'is_active') ? (valB ? 1 : 0) : (valB ?? -1);
					if (valA !== valB) {
						return sort.direction === 'asc' ? (valA - valB) : (valB - valA);
					}
				}
			}
			return 0;
		});
	}

	filteredData = transformed; 
	applyFilters(); 
}

function applyFilters() {
	const searchInput = document.querySelector('.search-input');
	const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
	
	const isRoot = !currentSelectedLabel || currentSelectedLabel === "Resources" || currentSelectedLabel === "All Resources";
	const validLabels = isRoot ? [] : [currentSelectedLabel.toLowerCase(), ...getDescendantLabels(currentSelectedLabel)];

	filteredData = filteredData.filter(res => {
		const name = (res.name || "").toLowerCase();
		const type = (res.type || "").toLowerCase();
		
		const matchesSearch = name.includes(searchTerm) || type.includes(searchTerm);
		const matchesCategory = isRoot || validLabels.includes(type);
		
		return matchesSearch && matchesCategory;
	});

	// Reset to page 1 if filtering changes results
	// We don't reset if just sorting
	renderPaginatedTable(); 
}

function selectCategory(label, displayLabel = null) {
	if (!label) label = "Resources";
	document.querySelector('.dropdown-selected').textContent = displayLabel || label;
	currentSelectedLabel = label;
	document.getElementById('taxonomy-list').style.display = 'none';
	applyAllTableTransforms();
	currentPage = 1;
}

function toggleSort(key) {
	const idx = sortStack.findIndex(s => s.key === key);
	
	// Fix: Always start with 'asc' (Up Arrow)
	const defaultDir = 'asc';
	const reverseDir = 'desc';

	if (idx === -1) {
		// Add new sort to the TOP of the stack
		sortStack.unshift({ key, direction: defaultDir });
	} else if (sortStack[idx].direction === defaultDir) {
		// Toggle direction
		sortStack[idx].direction = reverseDir;
	} else {
		// Remove if already toggled once (or keep it based on preference, here we remove)
		sortStack.splice(idx, 1);
	}

	// Keep Date and Active as fallbacks at the bottom of the stack if they aren't active
	if (!sortStack.find(s => s.key === 'is_active')) sortStack.push({ key: 'is_active', direction: 'desc' });
	if (!sortStack.find(s => s.key === 'date_reported')) sortStack.push({ key: 'date_reported', direction: 'desc' });

	updateSortVisuals();
	applyAllTableTransforms();
}

function updateSortVisuals() {
	document.querySelectorAll('.sort-btns span').forEach(el => {
		el.classList.remove('active-up', 'active-down');
	});

	// Only visualize the primary sort (first in stack)
	if (sortStack.length > 0) {
		const sort = sortStack[0];
		const headerDiv = document.querySelector(`[onclick*="'${sort.key}'"]`);
		if (headerDiv) {
			const upArrow = headerDiv.querySelector('.up');
			const downArrow = headerDiv.querySelector('.down');
			
			if (sort.direction === 'asc' && upArrow) upArrow.classList.add('active-up');
			if (sort.direction === 'desc' && downArrow) downArrow.classList.add('active-down');
		}
	}
}