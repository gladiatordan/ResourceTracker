/**
 * Resource Logic
 * Handles data fetching, status toggling, and row refreshing.
 */

// Global Data Store (Used by table.js for filtering/sorting)
let rawResourceData = [];

/**
 * Main Loader Function
 * Fetches data from API, updates the global store, and triggers the table render.
 */
async function loadResources() {
    try {
        // 1. Fetch from Backend
        const data = await API.fetchResources();
        
        // 2. Update Global Store
        rawResourceData = data;
        
        // 3. Render Table (Relies on table.js)
        if (typeof applyAllTableTransforms === 'function') {
            applyAllTableTransforms();
        } else {
            console.error("Table rendering function 'applyAllTableTransforms' not found.");
        }
        
        console.log(`Loaded ${rawResourceData.length} resources.`);
    } catch (error) {
        console.error("Failed to load resources:", error);
    }
}

// ------------------------------------------------------------------
// STATUS & ROW MANAGEMENT
// ------------------------------------------------------------------

async function toggleStatus(button, resourceName) {
    const statusSpan = button.previousElementSibling;
    const currentlyActive = statusSpan.textContent === "Active";
    const newState = !currentlyActive;

    // Optimistic UI update
    statusSpan.textContent = newState ? "Active" : "Inactive";
    statusSpan.className = `status-text ${newState ? 'active' : 'inactive'}`;

    try {
        const response = await fetch('/api/update-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: resourceName, is_active: newState })
        });

        if (response.ok) {
            refreshSingleRow(resourceName);
        } else {
            // Revert on failure
            statusSpan.textContent = currentlyActive ? "Active" : "Inactive";
            statusSpan.className = `status-text ${currentlyActive ? 'active' : 'inactive'}`;
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
    return '';
}

async function refreshSingleRow(resourceName) {
    try {
        // Use standard API URL format
        // NOTE: We generally fetch the whole list to keep sorting consistent, 
        // but for a single row refresh we can hit a specific endpoint if it existed.
        // For now, let's re-fetch the list to ensure consistency or implement a specific GET.
        
        // If you don't have a single-resource API endpoint yet, we can cheat:
        // Just update the specific item in rawResourceData locally if we know the change.
        // But assuming you want to fetch fresh data:
        
        // Ideally: const res = await API.fetchResource(resourceName);
        // Fallback: Re-load all (Safer for sorting/filtering consistency)
        await loadResources();
        return; 

        /* If you want to keep the specific DOM update logic from before, 
           you need an endpoint like /api/resource/<name>. 
           Since that might not exist yet, calling loadResources() is the safest 
           way to ensure the table stays in sync with the DB.
        */

    } catch (e) {
        console.error("Error refreshing row:", e);
    }
}

// ------------------------------------------------------------------
// PLANET MANAGEMENT
// ------------------------------------------------------------------

async function togglePlanet(selectElement, resourceName) {
    const planetValue = selectElement.value;
    if (!planetValue) return;

    // Find current resource data
    const res = rawResourceData.find(r => r.name === resourceName);
    if (!res) return;

    let currentPlanets = res.planets || [];
    
    // Toggle Logic
    const index = currentPlanets.indexOf(planetValue); // Case sensitive check from DB
    // We might need to handle case insensitivity if DB stores "Tatooine" but value is "tatooine"
    
    // Simple approach: Add if missing
    // (Real logic depends on your update-planets endpoint behavior)
    // For now, let's assume we want to ADD it.
    
    // TODO: Implement the update-planets API endpoint in app.py if it doesn't exist
    // Or reuse update-resource
}

async function handleBadgeClick(event, resourceName, planetValue) {
    // Placeholder for removing a planet
    console.log(`Remove ${planetValue} from ${resourceName}`);
}