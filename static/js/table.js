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