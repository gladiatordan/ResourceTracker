/**
 * Resource Logic
 * Handles data fetching, status toggling, and row refreshing.
 */

/**
 * Main Loader Function
 */
async function loadResources() {
    try {
        // 1. Fetch Data
        const dataPacket = await API.fetchResources(0); 
        
        // 2. Extract Resources list
        const newResources = dataPacket.resources || [];
        
        // 3. Update Global Store
        rawResourceData = newResources;
        lastSyncTime = Date.now();

        // Note: We no longer look for valid_types here. 
        // Taxonomy.js handles that via loadTaxonomy().

        // 4. Render Table
        if (typeof applyAllTableTransforms === 'function') {
            applyAllTableTransforms();
        }
        
        console.log(`Resources Loaded: ${rawResourceData.length}`);
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
        // Use API Wrapper
        await API.updateStatus(resourceName, newState);
        
        // Refresh to ensure DB sync
        await refreshSingleRow(resourceName);
    } catch (error) {
        console.error("Failed to save status:", error);
        // Revert on failure
        statusSpan.textContent = currentlyActive ? "Active" : "Inactive";
        statusSpan.className = `status-text ${currentlyActive ? 'active' : 'inactive'}`;
        alert("Failed to update status. " + error.message);
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
        // Simple fallback: reload all to keep sort order correct
        await loadResources();
    } catch (e) {
        console.error("Error refreshing row:", e);
    }
}

// ------------------------------------------------------------------
// PLANET MANAGEMENT
// ------------------------------------------------------------------

async function togglePlanet(selectElement, resourceName) {
    // Placeholder - Logic depends on update-resource endpoint implementation
    console.log("Toggle planet not fully implemented yet.");
}

async function handleBadgeClick(event, resourceName, planetValue) {
    console.log(`Remove ${planetValue} from ${resourceName}`);
}