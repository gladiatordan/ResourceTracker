function renderTable(data) {
    const tableBody = document.getElementById('resource-log-body');
    tableBody.innerHTML = '';

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

        row.innerHTML = `
            <td class="res-name">
				<a class="res-link" onclick="openResourceModal('${res.name.replace(/'/g, "\\'")}')">${res.name}</a>
			</td>
            <td class="res-type">${res.type}</td>
            <td class="col-stat">${res.res_oq || '-'}</td>
            <td class="col-stat">${res.res_cd || '-'}</td>
            <td class="col-stat">${res.res_dr || '-'}</td>
            <td class="col-stat">${res.res_fl || '-'}</td>
            <td class="col-stat">${res.res_hr || '-'}</td>
            <td class="col-stat">${res.res_ma || '-'}</td>
            <td class="col-stat">${res.res_pe || '-'}</td>
            <td class="col-stat">${res.res_ut || '-'}</td>
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
        tableBody.appendChild(row);
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

function applyAllTableTransforms() {
    let data = [...rawResourceData];

    // Multi-column Sort
    if (sortStack.length > 0) {
        data.sort((a, b) => {
            for (let sort of sortStack) {
                let valA = a[sort.key] ?? -1;
                let valB = b[sort.key] ?? -1;
                if (valA !== valB) {
                    return sort.direction === 'desc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
                }
            }
            return 0;
        });
    }

    renderTable(data);
    applyFilters(); // Re-run search/taxonomy filter visibility
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
	document.querySelectorAll('.sort-btns span').forEach(el => {
		el.classList.remove('active-up', 'active-down');
	});

	sortStack.forEach(sort => {
		const headerDiv = document.querySelector(`.sort-header[onclick*="'${sort.key}'"], .sort-header-left[onclick*="'${sort.key}'"]`);
		if (headerDiv) {
			const btn = sort.direction === 'asc' ? headerDiv.querySelector('.up') : headerDiv.querySelector('.down');
			btn.classList.add(sort.direction === 'asc' ? 'active-up' : 'active-down');
		}
	});
}

function applyFilters() {
    const searchTerm = document.querySelector('.search-input').value.toLowerCase();
    const isRoot = currentSelectedId === 1;
    
    // getDescendantLabels logic remains here
    const validLabels = isRoot ? [] : [currentSelectedLabel, ...getDescendantLabels(currentSelectedId)];

    document.querySelectorAll('#resource-log-body tr').forEach(row => {
        const type = row.querySelector('.res-type').textContent.toLowerCase();
        const name = row.cells[0].textContent.toLowerCase();
        
        const matchesSearch = name.includes(searchTerm) || type.includes(searchTerm);
        const matchesCategory = isRoot || validLabels.includes(type);

        row.style.display = (matchesSearch && matchesCategory) ? "" : "none";
    });
}

function toggleSort(key) {
    const idx = sortStack.findIndex(s => s.key === key);
    if (idx === -1) sortStack.push({ key, direction: 'asc' });
    else if (sortStack[idx].direction === 'asc') sortStack[idx].direction = 'desc';
    else sortStack.splice(idx, 1);

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

		row.innerHTML = `
				<td class="res-name">
					<a class="res-link" onclick="openResourceModal('${res.name.replace(/'/g, "\\'")}')">${res.name}</a>
				</td>
				<td class="res-type">${res.type}</td>
				<td class="col-stat">${res.res_oq || '-'}</td>
				<td class="col-stat">${res.res_cd || '-'}</td>
				<td class="col-stat">${res.res_dr || '-'}</td>
				<td class="col-stat">${res.res_fl || '-'}</td>
				<td class="col-stat">${res.res_hr || '-'}</td>
				<td class="col-stat">${res.res_ma || '-'}</td>
				<td class="col-stat">${res.res_pe || '-'}</td>
				<td class="col-stat">${res.res_ut || '-'}</td>
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

    document.getElementById('modal-title').textContent = res.name;
    
    const body = document.getElementById('modal-body');
    // Map the keys you want to show
    const fields = [
        { label: 'Type', val: res.type },
        { label: 'Overall Quality', val: res.res_oq },
        { label: 'Conductivity', val: res.res_cd },
        { label: 'Decay Resistance', val: res.res_dr },
        { label: 'Flavor', val: res.res_fl },
        { label: 'Heat Resistance', val: res.res_hr },
        { label: 'Malleability', val: res.res_ma },
        { label: 'Potential Energy', val: res.res_pe },
        { label: 'Unit Toughness', val: res.res_ut },
        { label: 'DateReported', val: res.date_reported },
        { label: 'Status', val: res.is_active ? 'Active' : 'Inactive' }
    ];

    body.innerHTML = fields.map(f => `
        <div style="color: var(--text-dim)">${f.label}:</div>
        <div style="color: var(--text-main)">${f.val || '-'}</div>
    `).join('');

    document.getElementById('resource-modal').style.display = 'flex';
}

function closeModal(event = null) {
    document.getElementById('resource-modal').style.display = 'none';
}