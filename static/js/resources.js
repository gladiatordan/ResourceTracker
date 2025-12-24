function renderTable(data) {
    const tableBody = document.getElementById('resource-log-body');
    tableBody.innerHTML = '';

    data.forEach(res => {
        const row = document.createElement('tr');
        const safeName = res.name.replace(/['\s]/g, '-');
        row.id = `row-${safeName}`;

        row.innerHTML = `
            <td>${res.name}</td>
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
                <div class="planets-container">
                    ${(res.planets || []).map(p => `<span class="planet ${p.toLowerCase()}" data-tooltip="${p}">${p[0].toUpperCase()}</span>`).join('')}
                </div>
            </td>
            <td class="col-date">${res.spawned_at || '-'}</td>
            <td class="col-status">
                <div class="status-container">
                    <span class="status-text ${res.is_active ? 'active' : 'inactive'}">${res.is_active ? 'Active' : 'Inactive'}</span>
                    <button class="toggle-status-btn" data-tooltip="${res.is_active ? 'Kill' : 'Revive'}" onclick="toggleStatus(this, '${res.name.replace(/'/g, "\\'")}')"></button>
                </div>
            </td>
            <td class="col-spacer"></td>
        `;
        tableBody.appendChild(row);
    });
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
                    return sort.direction === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
                }
            }
            return 0;
        });
    }

    renderTable(data);
    applyFilters(); // Re-run search/taxonomy filter visibility
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