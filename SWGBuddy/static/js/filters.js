/**
 * Filtering & Sorting Component
 * Handles the data transformation pipeline.
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
    
    // Taxonomy Logic (Label Based)
    // Note: getDescendantLabels is provided by taxonomy.js
    const isRoot = currentSelectedLabel === "Resources" || currentSelectedLabel === "All Resources";
    
    // If not root, we match the selected label AND all its children
    const validLabels = isRoot ? [] : [currentSelectedLabel.toLowerCase(), ...getDescendantLabels(currentSelectedLabel)];

    filteredData = filteredData.filter(res => {
        const name = (res.name || "").toLowerCase();
        const type = (res.type || "").toLowerCase();
        
        const matchesSearch = name.includes(searchTerm) || type.includes(searchTerm);
        const matchesCategory = isRoot || validLabels.includes(type);
        
        return matchesSearch && matchesCategory;
    });

    currentPage = 1; 
    renderPaginatedTable(); 
}

function selectCategory(label, displayLabel = null) {
    if (!label) label = "Resources";

	// Update the UI text
	document.querySelector('.dropdown-selected').textContent = displayLabel || label;
	
	currentSelectedLabel = label;
	
	// Close the dropdown
    const list = document.getElementById('taxonomy-list');
	if(list) list.style.display = 'none';
	
	// Trigger the combined filter
	applyAllTableTransforms();
}

function toggleSort(key) {
    const idx = sortStack.findIndex(s => s.key === key);
    const type = columnTypes[key] || 'alpha';
    
    const naturalDir = (type === 'alpha') ? 'asc' : 'desc';
    const reverseDir = (type === 'alpha') ? 'desc' : 'asc';

    if (idx === -1) {
        sortStack.push({ key, direction: naturalDir });
    } else if (sortStack[idx].direction === naturalDir) {
        sortStack[idx].direction = reverseDir;
    } else {
        sortStack.splice(idx, 1);
    }

    updateSortVisuals();
    applyAllTableTransforms();
}

function updateSortVisuals() {
    document.querySelectorAll('.sort-btns span').forEach(el => {
        el.classList.remove('active-up', 'active-down');
    });

    sortStack.forEach(sort => {
        const headerDiv = document.querySelector(`[onclick*="'${sort.key}'"]`);
        if (!headerDiv) return;

        const upArrow = headerDiv.querySelector('.up');
        const downArrow = headerDiv.querySelector('.down');

        if (sort.direction === 'asc' || sort.direction === 'desc') {
             // Visual mapping: ASC (A-Z) = Up Arrow, DESC (Z-A) = Down Arrow
             // Note: This can be subjective. Often Table UP = Ascending.
             if (sort.direction === 'asc') {
                 if(upArrow) upArrow.classList.add('active-up');
             } else {
                 if(downArrow) downArrow.classList.add('active-down');
             }
        }
    });
}