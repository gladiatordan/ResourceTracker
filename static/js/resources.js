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
			const rawVal = res[valKey];
			const rating = res[ratKey]; 
			
			// Logic for the cell text: show the value or a hyphen if null
			const isEmpty = rawVal === null || rawVal === undefined || rawVal === '-';
			const displayVal = isEmpty ? '-' : rawVal;
			
			const colorClass = getStatColorClass(rating);
			
			// Logic for the tooltip: only create the attribute if there is a rating
			let tooltipAttr = '';
			if (!isEmpty && rating !== null && rating !== undefined) {
				const pct = (rating * 100).toFixed(1) + '%';
				tooltipAttr = `data-tooltip="${pct}"`;
			}

			return `<td class="col-stat ${colorClass}" ${tooltipAttr}>${displayVal}</td>`;
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