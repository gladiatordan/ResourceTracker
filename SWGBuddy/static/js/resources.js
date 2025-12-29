/**
 * Resource Logic
 * Handles data fetching, status toggling, and row refreshing.
 */

// Global Store


/**
 * Main Loader Function
 */
async function loadResources() {
	try {
		const dataPacket = await API.fetchResources(0); 
		const newResources = dataPacket.resources || [];
		
		rawResourceData = newResources;
		LAST_SYNC_TIMESTAMP = Date.now();

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
	const resource = rawResourceData.find(r => r.name === resourceName);
	if (!resource) return console.error("Resource not found:", resourceName);

	const statusSpan = button.previousElementSibling;
	const currentlyActive = statusSpan.textContent === "Active";
	const newState = !currentlyActive;

	// Optimistic UI
	statusSpan.textContent = newState ? "Active" : "Inactive";
	statusSpan.className = `status-text ${newState ? 'active' : 'inactive'}`;

	try {
        // Prepare payload
        const payload = { ...resource, is_active: newState };
        
        // FIX: Remove planet fields to prevent accidental toggling/updates
        // validation.py now handles lists gracefully, but it's safer to just 
        // not send 'planet' if we aren't changing it.
        delete payload.planet;
        delete payload.planets;

        await API.updateResource(payload);
        
        resource.is_active = newState;
	} catch (error) {
		console.error("Failed to save status:", error);
		statusSpan.textContent = currentlyActive ? "Active" : "Inactive";
		statusSpan.className = `status-text ${currentlyActive ? 'active' : 'inactive'}`;
		alert("Failed: " + error.message);
	}
}

// ------------------------------------------------------------------
// PLANET MANAGEMENT
// ------------------------------------------------------------------

async function togglePlanet(selectElement, resourceName) {
	const newPlanet = selectElement.value;
	if (!newPlanet) return;

	const resource = rawResourceData.find(r => r.name === resourceName);
	if (!resource) return;

	// Local Update
	if (!resource.planets) resource.planets = [];
	// Note: Validation.py handles the toggle logic (remove if present), 
	// but here we are just triggering the update.
	// If we want accurate optimistic UI, we'd check if present and remove/add.
	// But since the dropdown usually only shows "Addable" planets, assume Add.
	
	try {
		// FIX: Send full object + new planet to toggle
		// The backend toggle logic relies on us sending the *singular* planet field to toggle it
		const payload = {
			...resource,
			planet: newPlanet // This specific field triggers the array toggle logic in backend
		};

		await API.updateResource(payload);

		selectElement.value = "";
		if (typeof applyAllTableTransforms === 'function') {
			// Reload to get the fresh array from DB (safest for array toggles)
			await loadResources(); 
		}
	} catch (error) {
		console.error("Failed to add planet:", error);
		alert("Error: " + error.message);
	}
}

async function handleBadgeClick(event, resourceName, planetValue) {
	if (event) { event.preventDefault(); event.stopPropagation(); }
	if (!window.Auth || !Auth.hasPermission('USER')) return;

	const resource = rawResourceData.find(r => r.name === resourceName);
	if (!resource) return;

	if (!confirm(`Remove ${planetValue} from ${resourceName}?`)) return;

	try {
		const payload = {
			...resource,
			planet: planetValue // Triggers toggle (remove)
		};

		await API.updateResource(payload);
		await loadResources(); 

	} catch (error) {
		console.error("Failed to remove planet:", error);
		alert("Error: " + error.message);
	}
}

function getStatColorClass(rating) {
	if (!rating || rating === '-') return '';
	if (rating >= 0.950) return 'stat-red';
	if (rating >= 0.900 && rating < 0.950) return 'stat-yellow';
	if (rating >= 0.500 && rating < 0.900) return 'stat-green';
	return '';
}

// ------------------------------------------------------------------
// MODAL BRIDGE
// ------------------------------------------------------------------

function openResourceModal(resourceName) {
	// Find the data object
	const resource = rawResourceData.find(r => r.name === resourceName);
	
	if (resource && window.Modal) {
		// Call the Modal controller to open in DETAILS mode
		window.Modal.openDetails(resource);
	} else {
		console.error("Cannot open modal: Resource not found or Modal not loaded.");
	}
}