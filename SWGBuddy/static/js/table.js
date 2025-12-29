/**
 * Table & Pagination Component
 * Handles rendering the resource log and navigation controls
 */

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
        `;
        tableBody.appendChild(row);

		if (res.name === selectedResourceName) {
			row.classList.add('highlighted-row');
		}
    });
}

/* ... imports assumed ... */

function renderResourceRow(res) {
    const tr = document.createElement('tr');
    tr.className = !res.is_active ? 'row-inactive' : '';

    const dateStr = formatDate(res.date_reported);
    const ratingClass = getStatColorClass(res.res_weight_rating);
    
    // --- PERMISSION CHECK ---
    // Guests see static text. Users (Level 1+) see interactive controls.
    const canEdit = window.Auth && Auth.hasPermission('USER');

    // 1. Status Column Logic
    let statusHtml = '';
    if (canEdit) {
        statusHtml = `
            <span class="status-text ${res.is_active ? 'active' : 'inactive'}">
                ${res.is_active ? 'Active' : 'Inactive'}
            </span>
            <button class="status-toggle-btn" onclick="toggleStatus(this, '${res.name}')">
                <i class="fa-solid fa-power-off"></i>
            </button>
        `;
    } else {
        statusHtml = `
            <span class="status-text ${res.is_active ? 'active' : 'inactive'}">
                ${res.is_active ? 'Active' : 'Inactive'}
            </span>
        `;
    }

    // 2. Planet Column Logic
    let locationHtml = '';
    
    // Render existing badges
    let badges = '';
    if (res.planets && res.planets.length > 0) {
        res.planets.forEach(p => {
            // Note: handleBadgeClick can perform deletion if we want to allow that for Users
            badges += `<span class="planet-badge" onclick="handleBadgeClick(event, '${res.name}', '${p}')">${p}</span>`;
        });
    }

    if (canEdit) {
        // Dropdown for adding
        // We get valid planets from taxonomy config
        const config = window.validResources ? window.validResources[res.type] : null;
        let options = '<option value="">+ Add</option>';
        
        if (config && config.planets) {
            config.planets.forEach(p => {
                if (!res.planets || !res.planets.includes(p)) {
                    options += `<option value="${p}">${p}</option>`;
                }
            });
        }
        
        locationHtml = `
            <div class="location-wrapper">
                <div class="planet-list">${badges}</div>
                <select class="planet-add-select" onchange="togglePlanet(this, '${res.name}')">
                    ${options}
                </select>
            </div>
        `;
    } else {
        // Static List
        locationHtml = `<div class="location-wrapper"><div class="planet-list">${badges}</div></div>`;
    }

    // 3. Name Link (Edit Modal)
    // Even guests might want to see details, but let's assume only Users can "Edit".
    // If you want Read-Only details for Guests, openResourceModal needs to handle "Read Only Mode".
    // For now, let's allow clicking, but the Modal itself should maybe disable Save if Guest.
    // (Or simpler: Disable click for Guests)
    const nameHtml = canEdit 
        ? `<a href="#" class="res-name-link" onclick="event.preventDefault(); openResourceModal('${res.name}')">${res.name}</a>`
        : `<span class="res-name-static">${res.name}</span>`;

    tr.innerHTML = `
        <td class="col-name">${nameHtml}</td>
        <td class="col-type">${res.type}</td>
        <td class="col-stat ${ratingClass} center-text">${formatStat(res.res_weight_rating, true)}</td>
        <td class="col-stat center-text">${formatStat(res.res_oq)}</td>
        <td class="col-stat center-text">${formatStat(res.res_cr)}</td>
        <td class="col-stat center-text">${formatStat(res.res_cd)}</td>
        <td class="col-stat center-text">${formatStat(res.res_dr)}</td>
        <td class="col-stat center-text">${formatStat(res.res_fl)}</td>
        <td class="col-stat center-text">${formatStat(res.res_hr)}</td>
        <td class="col-stat center-text">${formatStat(res.res_ma)}</td>
        <td class="col-stat center-text">${formatStat(res.res_pe)}</td>
        <td class="col-stat center-text">${formatStat(res.res_sr)}</td>
        <td class="col-stat center-text">${formatStat(res.res_ut)}</td>
        <td class="col-loc">${locationHtml}</td>
        <td class="col-date center-text">${dateStr}</td>
        <td class="col-status center-text status-cell">${statusHtml}</td>
    `;

    return tr;
}

// Helpers...
function formatStat(val, isRating=false) {
    if (val === null || val === undefined || val === 0 || val === "0") return "-";
    if (isRating) return (val * 100).toFixed(1) + '%';
    return val;
}

function formatDate(epoch) {
    if (!epoch) return "-";
    const d = new Date(epoch * 1000);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function renderPaginatedTable() {
    const start = (currentPage - 1) * resultsPerPage;
    const end = start + resultsPerPage;
    const paginatedData = filteredData.slice(start, end);
    renderTable(paginatedData);
    renderPageNumbers();
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

function goToPage(destination) {
    const totalPages = Math.ceil(filteredData.length / resultsPerPage);
    if (destination === 'first') currentPage = 1;
    else if (destination === 'last') currentPage = totalPages;
    else if (destination === 'prev') currentPage = Math.max(1, currentPage - 1);
    else if (destination === 'next') currentPage = Math.min(totalPages, currentPage + 1);
    else currentPage = parseInt(destination);
    renderPaginatedTable();
}

function changeResultsPerPage() {
    resultsPerPage = parseInt(document.getElementById('results-per-page').value);
    currentPage = 1;
    applyAllTableTransforms();
}

function highlightRow(rowElement, resourceName) {
    document.querySelectorAll('.resource-table tr.highlighted-row').forEach(row => {
        row.classList.remove('highlighted-row');
    });
    if (rowElement) {
        rowElement.classList.add('highlighted-row');
        selectedResourceName = resourceName;
    }
}