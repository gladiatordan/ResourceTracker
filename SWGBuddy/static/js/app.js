/**
 * Application Entry Point
 * Orchestrates the loading sequence and global event listeners.
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log("SWGBuddy Initializing...");
    const loader = document.getElementById('page-loader');

    try {
        // 1. Initialize UI Helpers (Tabs, listeners)
        initTabs(); 
        initListeners();

        // 2. Parallel Load: Session + Taxonomy + Resource Data
        // We need Session before we can determine Permissions for the Table
        await Promise.all([
            Auth.checkSession(),
            loadTaxonomy(),
            loadResources()
        ]);

        // 3. Update UI based on Role (hides/shows Add button)
        Auth.updateInterface();

        // 4. Render Table (Now that we have data AND permissions)
        // Note: loadResources calls applyAllTableTransforms internally, 
        // but we ensure permissions are applied by calling updateInterface first.
        // We force a re-render here to be safe if loadResources finished before checkSession
        applyAllTableTransforms();

        console.log("Initialization Complete.");

    } catch (error) {
        console.error("Critical Initialization Error:", error);
        if (loader) loader.innerHTML = `<div style="color:red">ERROR LOADING APP<br>${error.message}</div>`;
        return; // Don't remove loader if critical fail
    }

    // 5. Fade out Loader
    if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => {
            loader.style.display = 'none';
        }, 500);
    }
});

// Listener for Server Select Change
// When server changes, permissions might change, so we must re-check.
const serverSelect = document.getElementById('server-select-wrapper');
if (serverSelect) {
    serverSelect.addEventListener('change', async () => {
        console.log("Server Context Changed:", serverSelect.value);
        
        // Reload Resources for new server
        await loadResources(); 
        
        // Update Add Button visibility (User might be Admin on Server A but Guest on B)
        Auth.updateInterface();
        
        // Re-render table with new permissions
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
            document.getElementById(target).classList.add('active');
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
