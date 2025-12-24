function initTabs() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.page-container').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(target).classList.add('active');
            
            // Hide filters if not on resources
            document.querySelector('.header-controls').style.display = (target === 'resources-container') ? 'flex' : 'none';
        });
    });
}

// Global UI toggle for dropdown
function toggleDropdown() {
    const list = document.getElementById('taxonomy-list');
    list.style.display = list.style.display === 'block' ? 'none' : 'block';
}