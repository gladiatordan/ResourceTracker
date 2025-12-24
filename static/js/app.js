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

// Global UI toggle for dropdown
function toggleDropdown() {
    const list = document.getElementById('taxonomy-list');
    list.style.display = list.style.display === 'block' ? 'none' : 'block';
}