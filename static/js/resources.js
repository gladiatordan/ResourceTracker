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
    date_reported: 'numeric', // Dates sort like numbers (Epoch/Time)
    is_active: 'numeric'      // Booleans sort as 1/0
};

function highlightRow(rowElement, resourceName) {
    document.querySelectorAll('.resource-table tr.highlighted-row').forEach(row => {
        row.classList.remove('highlighted-row');
    });

    if (rowElement) {
        rowElement.classList.add('highlighted-row');
        selectedResourceName = resourceName; // Save state
    }
}

function renderTable(data) {
    const tableBody = document.getElementById('resource-log-body');
    tableBody.innerHTML = '';

	const statPairs = [
            ['res_oq', 'res_oq_rating'],
            ['res_cr', 'res_cr_rating'],
            ['res_cd', 'res_cd_rating'],
            ['res_dr', 'res_dr_rating'],
            ['res_fl', 'res_fl_rating'],
            ['res_hr', 'res_hr_rating'],
            ['res_ma', 'res_ma_rating'],
            ['res_pe', 'res_pe_rating'],
            ['res_sr', 'res_sr_rating'],
            ['res_ut', 'res_ut_rating']
        ];

    data.forEach(res => {
        const row = document.createElement('tr');
        const safeName = res.name.replace(/['\s]/g, '-');

		const rawDate = new Date(res.date_reported);
		const day = String(rawDate.getUTCDate()).padStart(2, '0')
		const month = String(rawDate.getUTCMonth() + 1).padStart(2, '0')
		const year = rawDate.getUTCFullYear();
		const formattedDate = `${day}/${month}/${year}`;

		const assignedPlanets = (res.planets || []).map(p => p.toLowerCase());
		const availableOptions = ALL_PLANETS
			.filter(p => !assignedPlanets.includes(p.toLowerCase()))
			.map(p => `<option value="${p.toLowerCase()}">${p}</option>`)
			.join('');

		const planetBadges = (res.planets || []).map(p => {
			const planetLower = p.toLowerCase();
			return `<span class="planet ${planetLower}" 
							data-tooltip="${p}" 
							onclick="handleBadgeClick(event, '${res.name}', '${planetLower}')">
							${p.charAt(0).toUpperCase()}
					</span>`;
		}).join(' ');
        row.id = `row-${safeName}`;

		row.onclick = () => highlightRow(row);

		const weightColor = getStatColorClass(res.res_weight_rating);

		const statCells = statPairs.map(([valKey, ratKey]) => {
            const val = res[valKey] || '-';
            const rating = res[ratKey]; 
            const colorClass = getStatColorClass(rating);
            return `<td class="col-stat ${colorClass}">${val}</td>`;
        }).join('');

        row.innerHTML = `
            <td class="res-name">
				<a class="res-link" onclick="openResourceModal('${res.name.replace(/'/g, "\\'")}')">${res.name}</a>
			</td>
            <td class="res-type">${res.type}</td>
            <td class="col-stat ${weightColor}">${parseInt(res.res_weight_rating * 1000)}</td>
			${statCells}
            <td class="col-loc">
                <div class="planets-container">${planetBadges}</div>
				<div class="planet-controls">
					<select class="planet-select" onchange="togglePlanet(this, '${res.name}')">
						<option value="" disabled selected>+</option>
						${availableOptions}
					</select>
				</div>
            </td>
            <td class="col-date">${formattedDate}</td>
            <td class="col-status">
                <div class="status-container">
                    <span class="status-text ${res.is_active ? 'active' : 'inactive'}">${res.is_active ? 'Active' : 'Inactive'}</span>
                    <button class="toggle-status-btn" data-tooltip="Toggle Status" onclick="toggleStatus(this, '${res.name.replace(/'/g, "\\'")}')"></button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);

		if (res.name === selectedResourceName) {
			row.classList.add('highlighted-row');
		}
    });
}

async function initTaxonomyDropdown() {
	// const response = await fetch('http://127.0.0.1:5000/api/taxonomy');
	// taxonomyData = await response.json();
	
	taxonomyMap = {}; 
	taxonomyData.forEach(item => {
		if (item.parent_id !== null) {
			if (!taxonomyMap[item.parent_id]) taxonomyMap[item.parent_id] = [];
			taxonomyMap[item.parent_id].push(item.id);
		}
	});

	const listContainer = document.getElementById('taxonomy-list');
	listContainer.innerHTML = '';

	// Create the single consolidated Root item
	const rootItem = document.createElement('div');
	rootItem.className = 'dropdown-item root-item';
	rootItem.textContent = "All Resources";
	// Point directly to ID 1 (Resources) logic
	rootItem.onclick = () => selectCategory(1, "Resources", "All Resources"); 
	listContainer.appendChild(rootItem);

	function buildBranch(parentId, container) {
		const children = taxonomyData.filter(item => item.parent_id === parentId);
		
		children.forEach(child => {
			const hasChildren = taxonomyMap[child.id] && taxonomyMap[child.id].length > 0;
			
			// Create the Item wrapper
			const itemDiv = document.createElement('div');
			itemDiv.className = 'dropdown-item-wrapper';
			
			// The clickable row
			const row = document.createElement('div');
			row.className = 'dropdown-item';
			row.style.paddingLeft = `${child.tree_level * 15}px`;
			
			if (hasChildren) {
				const icon = document.createElement('span');
				icon.className = 'toggle-icon';
				icon.innerHTML = '▼';
				icon.onclick = (e) => {
					e.stopPropagation(); // Don't trigger category selection
					const subBranch = itemDiv.querySelector('.branch-container');
					subBranch.classList.toggle('hidden');
					icon.classList.toggle('collapsed');
				};
				row.appendChild(icon);
			} else {
				const spacer = document.createElement('span');
				spacer.style.width = '21px'; // Match icon width
				row.appendChild(spacer);
			}

			const label = document.createElement('span');
			label.textContent = child.class_label;
			label.onclick = () => selectCategory(child.id, child.class_label);
			row.appendChild(label);

			itemDiv.appendChild(row);

			// If it has children, create a sub-container
			if (hasChildren) {
				const subBranch = document.createElement('div');
				subBranch.className = 'branch-container';
				buildBranch(child.id, subBranch);
				itemDiv.appendChild(subBranch);
			}

			container.appendChild(itemDiv);
		});
	}
	if (taxonomyMap[1]) {
		buildBranch(1, listContainer);    
	}
}

// resources.js

function applyAllTableTransforms() {
    let data = [...rawResourceData];

    if (sortStack.length > 0) {
        data.sort((a, b) => {
            for (let sort of sortStack) {
                let valA = a[sort.key];
                let valB = b[sort.key];
                const type = columnTypes[sort.key];

                if (type === 'alpha') {
                    valA = (valA || "").toLowerCase();
                    valB = (valB || "").toLowerCase();

					
                    if (valA !== valB) {
                        return sort.direction === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
                    }
                } else {
                    // Numeric/Date logic: desc = High to Low, asc = Low to High
                    // For dates, spawned_at (timestamp) is numeric
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

    rawResourceData = data;
    applyFilters();
}

function selectCategory(id, classLabel, displayLabel = null) {
	// Update the UI text - use displayLabel if provided (e.g., "All Resources")
	document.querySelector('.dropdown-selected').textContent = displayLabel || classLabel;
	
	currentSelectedId = id;
	currentSelectedLabel = classLabel.toLowerCase();
	
	// Close the dropdown
	document.getElementById('taxonomy-list').style.display = 'none';
	
	// Trigger the combined filter
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

function changeResultsPerPage() {
    resultsPerPage = parseInt(document.getElementById('results-per-page').value);
    currentPage = 1; // Reset to page 1 on change
    applyAllTableTransforms();
}

function applyFilters() {
   const searchTerm = document.querySelector('.search-input').value.toLowerCase();
    const isRoot = currentSelectedId === 1;
    const validLabels = isRoot ? [] : [currentSelectedLabel, ...getDescendantLabels(currentSelectedId)];

    filteredData = rawResourceData.filter(res => {
        const matchesSearch = res.name.toLowerCase().includes(searchTerm) || 
                             res.type.toLowerCase().includes(searchTerm);
        const matchesCategory = isRoot || validLabels.includes(res.type.toLowerCase());
        return matchesSearch && matchesCategory;
    });

    currentPage = 1; // Reset to page 1 whenever filters change
    renderPaginatedTable();
}

function renderPaginatedTable() {
    const start = (currentPage - 1) * resultsPerPage;
    const end = start + resultsPerPage;
    const paginatedData = filteredData.slice(start, end);

    renderTable(paginatedData); // Uses your existing render function
    renderPageNumbers();
}

function goToPage(destination) {
    const totalPages = Math.ceil(filteredData.length / resultsPerPage);

    if (destination === 'first') currentPage = 1;
    else if (destination === 'last') currentPage = totalPages;
    else if (destination === 'prev') currentPage = Math.max(1, currentPage - 1);
    else if (destination === 'next') currentPage = Math.min(totalPages, currentPage + 1);
    else currentPage = parseInt(destination);

    renderPaginatedTable();
}

function renderPageNumbers() {
    const pageSelect = document.getElementById('page-select');
    const totalPages = Math.ceil(filteredData.length / resultsPerPage) || 1;
    
    // Populate Dropdown
    pageSelect.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Page ${i}`;
        if (i === currentPage) option.selected = true;
        pageSelect.appendChild(option);
    }

    // Update Button States
    document.getElementById('btn-first').disabled = (currentPage === 1);
    document.getElementById('btn-prev').disabled = (currentPage === 1);
    document.getElementById('btn-next').disabled = (currentPage === totalPages);
    document.getElementById('btn-last').disabled = (currentPage === totalPages);
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

async function toggleStatus(button, resourceName) {
	const statusSpan = button.previousElementSibling;
	const currentlyActive = statusSpan.textContent === "Active";
	const newState = !currentlyActive;

	// Optimistic UI update
	statusSpan.textContent = newState ? "Active" : "Inactive";
	statusSpan.className = `status-text ${newState ? 'active' : 'inactive'}`;

	try {
		const response = await fetch('http://127.0.0.1:5000/api/update-status', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: resourceName, is_active: newState })
		});

		if (response.ok) {
			refreshSingleRow(resourceName);
		}
	} catch (error) {
		console.error("Failed to save status:", error);
	}
}

function getStatColorClass(rating) {
    if (!rating || rating === '-') return '';

    if (rating >= 0.950) return 'stat-red';
    if (rating >= 0.900 && rating < 0.950) return 'stat-yellow';
    if (rating >= 0.500 && rating < 0.900) return 'stat-green';
    
    return ''; // Default (no change)
}

async function refreshSingleRow(resourceName) {
	try {
		const response = await fetch(`http://127.0.0.1:5000/api/resource/${resourceName}`)
		const res = await response.json();

		const rowId = `row-${resourceName.replace(/\s+/g, '-')}`;
		const row = document.getElementById(rowId);

		const rawDate = new Date(res.date_reported);
		const day = String(rawDate.getUTCDate()).padStart(2, '0')
		const month = String(rawDate.getUTCMonth() + 1).padStart(2, '0')
		const year = rawDate.getUTCFullYear();
		const formattedDate = `${day}/${month}/${year}`;

		// 1. UPDATE THE SOURCE DATA
        // Find the index of the resource in your main data array
        const dataIndex = rawResourceData.findIndex(item => item.name === resourceName);
        
        if (dataIndex !== -1) {
            // Update the object in rawResourceData with the new data from the server
            rawResourceData[dataIndex] = res;
        }

		if (!row) return;

		const assignedPlanets = (res.planets || []).map(p => p.toLowerCase());
		const availableOptions = ALL_PLANETS
			.filter(p => !assignedPlanets.includes(p.toLowerCase()))
			.map(p => `<option value="${p.toLowerCase()}">${p}</option>`)
			.join('');

		const planetBadges = (res.planets || []).map(p => {
			const planetLower = p.toLowerCase();
			return `<span class="planet ${planetLower}" 
							data-tooltip="${p}" 
							onclick="handleBadgeClick(event, '${res.name}', '${planetLower}')">
							${p.charAt(0).toUpperCase()}
					</span>`;
		}).join(' ');

		const statPairs = [
            ['res_oq', 'res_oq_rating'],
            ['res_cr', 'res_cr_rating'],
            ['res_cd', 'res_cd_rating'],
            ['res_dr', 'res_dr_rating'],
            ['res_fl', 'res_fl_rating'],
            ['res_hr', 'res_hr_rating'],
            ['res_ma', 'res_ma_rating'],
            ['res_pe', 'res_pe_rating'],
            ['res_sr', 'res_sr_rating'],
            ['res_ut', 'res_ut_rating']
        ];

		const weightColor = getStatColorClass(res.res_weight_rating);

		const statCells = statPairs.map(([valKey, ratKey]) => {
            const val = res[valKey] || '-';
            const rating = res[ratKey]; 
            const colorClass = getStatColorClass(rating);
            return `<td class="col-stat ${colorClass}">${val}</td>`;
        }).join('');

		row.innerHTML = `
				<td class="res-name">
					<a class="res-link" onclick="openResourceModal('${res.name.replace(/'/g, "\\'")}')">${res.name}</a>
				</td>
				<td class="res-type">${res.type}</td>
				<td class="col-stat ${weightColor}">${parseInt(res.res_weight_rating * 1000)}</td>
				${statCells}
				<td class="col-loc">
					<div class="planets-container">${planetBadges}</div>
					<div class="planet-controls">
						<select class="planet-select" onchange="togglePlanet(this, '${res.name}')">
							<option value="" disabled selected>+</option>
							${availableOptions}
						</select>
					</div>
				</td>
				<td class="col-date">${formattedDate}</td>
				<td class="col-status">
					<div class="status-container">
						<span class="status-text ${res.is_active ? 'active' : 'inactive'}">${res.is_active ? 'Active' : 'Inactive'}</span>
						<button class="toggle-status-btn" data-tooltip="Toggle Status" onclick="toggleStatus(this, '${res.name.replace(/'/g, "\\'")}')"></button>
					</div>
				</td>
				<td class="col-spacer"></td>
			`;
		if (sortStack.length > 0) {
            applyAllTableTransforms();
        }
	} catch (e) {
		console.error("Error refreshing row:", e);
	}
}

async function togglePlanet(selectElement, resourceName) {
	const planetValue = selectElement.value;
	if (!planetValue) return;

	const container = selectElement.closest('.col-loc').querySelector('.planets-container');
	
	let currentPlanets = Array.from(container.querySelectorAll('.planet'))
								.map(p => p.getAttribute('data-tooltip').toLowerCase());
	
	// Add if not present, remove if it is (Toggle)
	const index = currentPlanets.indexOf(planetValue);
	if (index > -1) {
		currentPlanets.splice(index, 1);
	} else {
		currentPlanets.push(planetValue);
	}

	currentPlanets.sort();

	try {
		const response = await fetch('http://127.0.0.1:5000/api/update-planets', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: resourceName, planets: currentPlanets })
		});
		if (response.ok) {
			refreshSingleRow(resourceName);    
		}
	} catch (error) {
		console.error("Failed to toggle planet:", error);
	}

	selectElement.value = ""; 
}

function renderPlanetBadges(container, planetList, selectElement, resourceName) {
	const rowId = `row-${resourceName.replace(/\s+/g, '-')}`;
	const row = document.getElementById(rowId);
	container.innerHTML = '';
	planetList.forEach(p => {
		const span = document.createElement('span');
		span.className = `planet ${p}`;
		span.setAttribute('data-tooltip', p.charAt(0).toUpperCase() + p.slice(1));
		span.textContent = p.charAt(0).toUpperCase();
		
		// Removal logic
		span.onclick = async () => {
			const newList = planetList.filter(item => item !== p);
			// Re-run the update-planets fetch here for removal...
			container.remove(); // Simplify for now: full refresh is safer
			// refreshSingleRow(); 
		};
		container.appendChild(span);
	});
}

async function handleBadgeClick(event, resourceName, planetValue) {
	// 1. Get the actual element from the event
	const badgeElement = event.currentTarget;
	
	// 2. Find the container relative to the clicked badge
	const container = badgeElement.closest('.planets-container');
	
	if (!container) {
		console.error("Could not find .planets-container for", resourceName);
		return;
	}

	// 3. Get current list from badges in this specific container
	let currentPlanets = Array.from(container.querySelectorAll('.planet'))
								.map(p => p.getAttribute('data-tooltip').toLowerCase());
	
	// 4. Filter out the clicked planet
	const newList = currentPlanets.filter(p => p !== planetValue);
	
	// 5. Save to DB
	try {
		const response = await fetch('http://127.0.0.1:5000/api/update-planets', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: resourceName, planets: newList })
		});
		
		if (response.ok) {
			refreshSingleRow(resourceName); // Refresh table data
		}
	} catch (e) {
		console.error("Error removing planet:", e);
	}
}

function openResourceModal(resourceName) {
    const res = rawResourceData.find(r => r.name === resourceName);
    if (!res) return;

	// Highlight the row when the link is clicked
    const rowId = `row-${resourceName.replace(/['\s]/g, '-')}`;
    const row = document.getElementById(rowId);
    highlightRow(row);

    originalModalData = { ...res }; // Store original data
    renderModalContent(res);
    resetModalUI();

    document.getElementById('resource-modal').style.display = 'flex';
}

function resetModalUI() {
    document.getElementById('modal-status-bar').textContent = '';
    document.getElementById('btn-edit').disabled = false;
    document.getElementById('btn-save').disabled = true;
    document.getElementById('btn-cancel').disabled = true;
}

function clearStatusBar() {
    document.getElementById('modal-status-bar').textContent = '';
}

function enterEditMode() {
    clearStatusBar();
    renderModalContent(originalModalData, true);
    document.getElementById('btn-edit').disabled = true;
    document.getElementById('btn-cancel').disabled = false;
}

function cancelEditMode() {
    clearStatusBar();
    renderModalContent(originalModalData, false);
    resetModalUI();
}

function onModalInputChange() {
    clearStatusBar();
    document.getElementById('btn-save').disabled = false;
}

function renderModalContent(data, isEditable = false) {
    const body = document.getElementById('modal-body');
    // Identify which keys should be treated as numeric quality stats
    const numericKeys = ['res_rating', 'res_oq', 'res_cr', 'res_cd', 'res_dr', 'res_fl', 'res_hr', 'res_ma', 'res_pe', 'res_sr', 'res_ut'];
    
	// 1. Build the Type Display
    let typeDisplay;
    if (isEditable) {
        // Custom dropdown container for the Modal
        typeDisplay = `
            <div class="custom-dropdown modal-dropdown" id="modal-taxonomy-dropdown">
                <div class="dropdown-selected" onclick="toggleModalDropdown()">${data.type}</div>
                <div class="dropdown-list" id="modal-taxonomy-list" style="display: none;"></div>
                <input type="hidden" id="modal-type-value" data-key="type" value="${data.type}">
            </div>`;
    } else {
        typeDisplay = data.type;
    }

    // 2. Define the field mapping
    const fields = [
        { label: 'Type', key: 'type', val: typeDisplay, isCustom: true },
        { label: 'Rating', key: 'res_rating', val: data.res_rating },
        { label: 'Overall Quality', key: 'res_oq', val: data.res_oq },
        { label: 'Cold Resistance', key: 'res_cr', val: data.res_cr },
        { label: 'Conductivity', key: 'res_cd', val: data.res_cd },
        { label: 'Decay Resistance', key: 'res_dr', val: data.res_dr },
        { label: 'Flavor', key: 'res_fl', val: data.res_fl },
        { label: 'Heat Resistance', key: 'res_hr', val: data.res_hr },
        { label: 'Malleability', key: 'res_ma', val: data.res_ma },
        { label: 'Potential Energy', key: 'res_pe', val: data.res_pe },
		{ label: 'Shock Resistance', key: 'res_sr', val: data.res_sr }, 
        { label: 'Unit Toughness', key: 'res_ut', val: data.res_ut },
        { label: 'Date Reported', key: 'date_reported', val: formatDate(data.date_reported), skipEdit: true },
        { label: 'Status', key: 'is_active', val: data.is_active ? 'Active' : 'Inactive', skipEdit: true },
		{ label: 'Notes', key: 'notes', val: data.notes || '', skipEdit: false }
    ];

    // 3. Render the grid
    body.innerHTML = fields.map(f => {
        let valueHTML;
        if (f.isCustom) {
            valueHTML = f.val;
        } else if (isEditable && !f.skipEdit) {
            const isNumeric = numericKeys.includes(f.key);
            valueHTML = `<input type="${isNumeric ? 'number' : 'text'}" step="1" value="${f.val || ''}" oninput="onModalInputChange()" data-key="${f.key}">`;
        } else {
            valueHTML = f.val || '-';
        }
        return `<div class="modal-label">${f.label}</div><div class="modal-value">${valueHTML}</div>`;
    }).join('');

    // If we are in edit mode, populate the custom dropdown tree
    if (isEditable) {
        initModalTaxonomy();
    }
}

async function saveResourceEdits() {
    const inputs = document.querySelectorAll('.modal-value input, #modal-type-value');
    const updatedData = { ...originalModalData };
    const statusBox = document.getElementById('modal-status-bar');
    
    // Validation Logic
    let isValid = true;
    inputs.forEach(input => {
        const key = input.getAttribute('data-key');
        let val = input.value;

        // If it's a numeric field, ensure it's a whole number
        if (input.type === 'number') {
            const numVal = Number(val);
            // Check if it's an integer and not empty
            if (val === '' || !Number.isInteger(numVal) || numVal < 0 || numVal > 1000) {
                isValid = false;
                input.style.borderColor = "#ef4444"; // Visual error cue
            } else {
                input.style.borderColor = "var(--border-color)";
                val = parseInt(val, 10); // Ensure it's stored as an integer
            }
        }
        updatedData[key] = val;
    });

    if (!isValid) {
        statusBox.textContent = "Validation Error: Stats must be 0-1000";
        statusBox.className = "status-bar status-error";
        return;
    }

    try {
        const response = await fetch('http://127.0.0.1:5000/api/update-resource', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });

        if (response.ok) {
            statusBox.textContent = "Update Successful";
            statusBox.className = "status-bar status-success";
            
            // Sync global data array
            const idx = rawResourceData.findIndex(r => r.name === updatedData.name);
            if (idx !== -1) rawResourceData[idx] = updatedData;
            
            // Exit edit mode
            originalModalData = { ...updatedData };
            renderModalContent(updatedData, false);
            resetModalUI();
            applyAllTableTransforms(); 
        } else {
            throw new Error("Server rejected update");
        }
    } catch (e) {
        statusBox.textContent = "Update Failed: Server Error";
        statusBox.className = "status-bar status-error";
    }
}

function closeModal(event = null) {
    document.getElementById('resource-modal').style.display = 'none';
}

function toggleModalDropdown() {
    const list = document.getElementById('modal-taxonomy-list');
    list.style.display = list.style.display === 'block' ? 'none' : 'block';
}

function initModalTaxonomy() {
    const listContainer = document.getElementById('modal-taxonomy-list');
    listContainer.innerHTML = '';

    function buildModalBranch(parentId, container) {
        const children = taxonomyData.filter(item => item.parent_id === parentId);
        children.forEach(child => {
            const hasChildren = taxonomyMap[child.id] && taxonomyMap[child.id].length > 0;
            const itemDiv = document.createElement('div');
            itemDiv.className = 'dropdown-item-wrapper';
            
            const row = document.createElement('div');
            row.className = 'dropdown-item';
            row.style.paddingLeft = `${child.tree_level * 15}px`;
            
            if (hasChildren) {
                const icon = document.createElement('span');
                icon.className = 'toggle-icon';
                icon.innerHTML = '▼';
                icon.onclick = (e) => {
                    e.stopPropagation();
                    const subBranch = itemDiv.querySelector('.branch-container');
                    subBranch.classList.toggle('hidden');
                    icon.classList.toggle('collapsed');
                };
                row.appendChild(icon);
            } else {
                const spacer = document.createElement('span');
                spacer.style.width = '21px';
                row.appendChild(spacer);
            }

            const label = document.createElement('span');
            label.textContent = child.class_label;
            label.onclick = () => {
                document.querySelector('#modal-taxonomy-dropdown .dropdown-selected').textContent = child.class_label;
                document.getElementById('modal-type-value').value = child.class_label;
                toggleModalDropdown();
                onModalInputChange(); // Activate Save button
            };
            row.appendChild(label);
            itemDiv.appendChild(row);

            if (hasChildren) {
                const subBranch = document.createElement('div');
                subBranch.className = 'branch-container';
                buildModalBranch(child.id, subBranch);
                itemDiv.appendChild(subBranch);
            }
            container.appendChild(itemDiv);
        });
    }
    buildModalBranch(1, listContainer); 
}