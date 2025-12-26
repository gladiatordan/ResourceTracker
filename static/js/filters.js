/**
 * Filtering & Sorting Component
 * Handles the data transformation pipeline
 */

const columnTypes = {
    name: 'alpha',
    type: 'alpha',
    res_rating: 'numeric',
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
    // 1. Always start with a fresh copy of the master data
    let data = [...rawResourceData];

    // 2. Apply Multi-Column Sort Stack
    if (sortStack.length > 0) {
        data.sort((a, b) => {
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
                    // Numeric/Date logic
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

    // 3. Update the global rawResourceData with the new sort order
    rawResourceData = data;
    applyFilters();
}

function applyFilters() {
    const searchTerm = document.querySelector('.search-input').value.toLowerCase();
    const isRoot = currentSelectedId === 1;
    const validLabels = isRoot ? [] : [currentSelectedLabel, ...getDescendantLabels(currentSelectedId)];

    // Filter based on search box and taxonomy selection
    filteredData = rawResourceData.filter(res => {
        const matchesSearch = res.name.toLowerCase().includes(searchTerm) || 
                             res.type.toLowerCase().includes(searchTerm);
        const matchesCategory = isRoot || validLabels.includes(res.type.toLowerCase());
        return matchesSearch && matchesCategory;
    });

    currentPage = 1; 
    renderPaginatedTable();
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
        const type = columnTypes[sort.key];
        const headerDiv = document.querySelector(`[onclick*="'${sort.key}'"]`);
        if (!headerDiv) return;

        const upArrow = headerDiv.querySelector('.up');
        const downArrow = headerDiv.querySelector('.down');

        if (type === 'alpha') {
            if (sort.direction === 'asc') upArrow.classList.add('active-up');
            else if (sort.direction === 'desc') downArrow.classList.add('active-down');
        } else {
            if (sort.direction === 'desc') upArrow.classList.add('active-up');
            else if (sort.direction === 'asc') downArrow.classList.add('active-down');
        }
    });
}

function selectCategory(id, classLabel, displayLabel = null) {
    const display = document.querySelector('.dropdown-selected');
    if (display) display.textContent = displayLabel || classLabel;
    
    currentSelectedId = id;
    currentSelectedLabel = classLabel.toLowerCase();
    
    const list = document.getElementById('taxonomy-list');
    if (list) list.style.display = 'none';
    
    applyFilters();
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