async function loadServers() {
    // We can piggyback on the 'get_init_data' call which returns {taxonomy, servers, resources}
    // Or assume the page load fetched it. 
    // For now, let's update initTabs/Listeners to fetch it.
    
    // Actually, api.js fetchResources calls 'get_init_data'.
    // Let's modify loadResources() in resources.js or create a specific init.
}

async function initServerList(serverData) {
    const select = document.getElementById('server-select');
    if (!select || !serverData) return;

    select.innerHTML = '';
    const saved = localStorage.getItem('swg_server_id') || 'cuemu';

    // serverData is an object: { 'cuemu': {name: 'CUEmu', ...}, 'legends': {...} }
    Object.values(serverData).forEach(server => {
        if (!server.is_active) return;
        const option = document.createElement('option');
        option.value = server.id;
        option.textContent = server.display_name;
        if (server.id === saved) option.selected = true;
        select.appendChild(option);
    });
}

function initTabs() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const containers = document.querySelectorAll('.page-container');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');

            navButtons.forEach(b => b.classList.remove('active'));
            containers.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(target).classList.add('active');
            
            // Note: .header-controls logic is no longer needed if 
            // the filters are inside the page-container!
        });
    });
}

function initListeners() {
	document.querySelector('.search-input').addEventListener('input', applyAllTableTransforms);
    document.querySelector('.dropdown-selected').addEventListener('change', applyAllTableTransforms);
}

// Global UI toggle for dropdown
function toggleDropdown() {
    const list = document.getElementById('taxonomy-list');
    list.style.display = list.style.display === 'block' ? 'none' : 'block';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
}