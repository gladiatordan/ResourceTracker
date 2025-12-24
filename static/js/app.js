function initTabs() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const containers = document.querySelectorAll('.page-container');
    const controls = document.querySelector('.header-controls');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');

            // Toggle Active Classes
            navButtons.forEach(b => b.classList.remove('active'));
            containers.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(target).classList.add('active');

            // Ensure filters only show for Resources
            if (target === 'resources-container') {
                controls.style.display = 'flex';
            } else {
                controls.style.display = 'none';
            }
        });
    });
}

// Global UI toggle for dropdown
function toggleDropdown() {
    const list = document.getElementById('taxonomy-list');
    list.style.display = list.style.display === 'block' ? 'none' : 'block';
}