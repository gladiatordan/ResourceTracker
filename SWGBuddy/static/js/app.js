/**
 * Application Entry Point
 * Orchestrates the loading sequence and global event listeners.
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log("SWGBuddy Initializing...");
    const loader = document.getElementById('page-loader');

    try {
        initTabs(); 
        initListeners();

        await Promise.all([
            Auth.checkSession(),
            loadTaxonomy(),
            loadResources()
        ]);

        Auth.updateInterface();

        // Render Table & Sort Indicators
        applyAllTableTransforms();
        updateSortVisuals(); // <--- Lights up default sort arrows

        console.log("Initialization Complete.");

    } catch (error) {
        console.error("Critical Initialization Error:", error);
        if (loader) loader.innerHTML = `<div style="color:red">ERROR LOADING APP<br>${error.message}</div>`;
        return; 
    }

    if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => {
            loader.style.display = 'none';
        }, 500);
    }
});

// Listener for Server Select Change
const serverSelect = document.getElementById('server-select-wrapper');
if (serverSelect) {
    serverSelect.addEventListener('change', async () => {
        console.log("Server Context Changed:", serverSelect.value);
        await loadResources(); 
        Auth.updateInterface();
        applyAllTableTransforms();
    });
}

function initTabs() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            const target = btn.getAttribute('data-target');
			const targetPage = document.getElementById(target);
            // document.getElementById(target).classList.add('active');

			if (targetPage) {
				targetPage.classList.add('active');

				// check if we just switched to the Resources page
				// We identify it by looking for the unique table body ID inside the target page
				if (targetPage.querySelector('#resource-log-body')) {
					console.log("Resources tab activated: Triggering sync...");
					if (typeof loadResources === 'function') {
						loadResources(true); // Trigger delta sync and resume polling
					}
				}
			}
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
