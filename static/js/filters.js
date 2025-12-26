/**
 * Filtering & Sorting Component
 * Handles the data transformation pipeline
 */

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

function applyAllTableTransforms() {
    // 1. Always start from the Master List to prevent data loss
    let transformed = [...rawResourceData];

    // 2. Apply Sorting based on the centralized sortStack
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
                        return sort.direction === 'desc' ? (valB - valA) : (valA - valB);
                    }
                }
            }
            return 0;
        });
    }

    // 3. Move the sorted data into filteredData for the filter to use
    filteredData = transformed; 
    
    // 4. Final step: Run the filter logic
    applyFilters(); 
}

function applyFilters() {
    const searchTerm = document.querySelector('.search-input').value.toLowerCase();
    const isRoot = currentSelectedId === 1; //
    const validLabels = isRoot ? [] : [currentSelectedLabel, ...getDescendantLabels(currentSelectedId)]; //

    // Filter the ALREADY SORTED data
    filteredData = filteredData.filter(res => {
        const name = (res.name || "").toLowerCase();
        const type = (res.type || "").toLowerCase();
        
        const matchesSearch = name.includes(searchTerm) || type.includes(searchTerm);
        const matchesCategory = isRoot || validLabels.includes(type);
        
        return matchesSearch && matchesCategory;
    });

    currentPage = 1; 
    renderPaginatedTable(); //
}

function toggleSort(key) {
    const idx = sortStack.findIndex(s => s.key === key);
    const type = columnTypes[key] || 'alpha';
    
    // Step 1: Define what the "First Click" (Natural) direction is
    // Alpha: Up (asc) = A-Z | Numeric: Up (desc) = High-Low
    const naturalDir = (type === 'alpha') ? 'asc' : 'desc';
    const reverseDir = (type === 'alpha') ? 'desc' : 'asc';

    if (idx === -1) {
        // First click: Start with Natural Direction
        sortStack.push({ key, direction: naturalDir });
    } else if (sortStack[idx].direction === naturalDir) {
        // Second click: Switch to Reverse Direction
        sortStack[idx].direction = reverseDir;
    } else {
        // Third click: Remove from sort (The "Off" state)
        sortStack.splice(idx, 1);
    }

    updateSortVisuals();
    applyAllTableTransforms();
}

function updateSortVisuals() {
    // 1. Clear all active classes
    document.querySelectorAll('.sort-btns span').forEach(el => {
        el.classList.remove('active-up', 'active-down');
    });

    // 2. Re-apply based on current stack
    sortStack.forEach(sort => {
        const type = columnTypes[sort.key];
        const headerDiv = document.querySelector(`[onclick*="'${sort.key}'"]`);
        if (!headerDiv) return;

        const upArrow = headerDiv.querySelector('.up');
        const downArrow = headerDiv.querySelector('.down');

        if (type === 'alpha') {
            // Alpha: Up = asc (A-Z), Down = desc (Z-A)
            if (sort.direction === 'asc') upArrow.classList.add('active-up');
            else if (sort.direction === 'desc') downArrow.classList.add('active-down');
        } else {
            // Numeric/Date: Up = desc (High-to-Low), Down = asc (Low-to-High)
            if (sort.direction === 'desc') upArrow.classList.add('active-up');
            else if (sort.direction === 'asc') downArrow.classList.add('active-down');
        }
    });
}

function selectCategory(id, classLabel, displayLabel = null) {
	// Update the UI text - use displayLabel if provided (e.g., "All Resources")
	document.querySelector('.dropdown-selected').textContent = displayLabel || classLabel;
	
	currentSelectedId = id;
	currentSelectedLabel = classLabel.toLowerCase();
	
	// Close the dropdown
	document.getElementById('taxonomy-list').style.display = 'none';
	
	// Trigger the combined filter
	applyAllTableTransforms();
}

function getDescendantLabels(parentId) {
	let labels = [];
	const childrenIds = taxonomyMap[parentId] || [];

	childrenIds.forEach(childId => {
		const child = taxonomyData.find(t => t.id === childId);
		if (child) {
			labels.push(child.class_label.toLowerCase());
			labels = labels.concat(getDescendantLabels(childId));
		}
	});
	return labels;
}