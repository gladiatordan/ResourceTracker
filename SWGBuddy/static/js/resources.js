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
		// Use global variable for tracking delta syncs if applicable
		if (typeof LAST_SYNC_TIMESTAMP !== 'undefined') {
			LAST_SYNC_TIMESTAMP = Date.now();
		}

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
		// Send full object excluding planet to avoid array issues
		const payload = { ...resource, is_active: newState };
		delete payload.planet; // Don't toggle planets
		delete payload.planets;

		await API.updateResource(payload);
		
		resource.is_active = newState;
	} catch (error) {
		console.error("Failed to save status:", error);
		// Revert UI
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

	// Normalize property
	const pList = resource.planet || resource.planets || [];
	// Ensure we are updating the canonical property 'planet'
	resource.planet = pList; 

	// Local Optimistic Update
	if (!resource.planet.includes(newPlanet)) {
		// Just push to local for responsiveness; reload will sort it.
		resource.planet.push(newPlanet); 
	}

	try {
		await API.updateResource({
			id: resource.id,
			name: resource.name,
			type: resource.type, 
			planet: newPlanet // Backend toggles (appends) this value
		});

		selectElement.value = "";
		// Reload to get sorted, verified list from DB
		await loadResources(); 
		
	} catch (error) {
		console.error("Failed to add planet:", error);
		alert("Error: " + error.message);
	}
}

async function handleBadgeClick(event, resourceName, planetValue) {
	if (event) {
		event.preventDefault();
		event.stopPropagation();
	}

	// Permission Check (Assuming Auth exists)
	if (window.Auth && !Auth.hasPermission('USER')) return;

	const resource = rawResourceData.find(r => r.name === resourceName);
	if (!resource) return;

	// 2. Check for "Don't Prompt Again" preference in localStorage
    const skipConfirmation = localStorage.getItem('swgbuddy_skip_planet_confirm') === 'true';

    // 3. Confirmation Logic
    if (!skipConfirmation) {
        // Since standard browser confirm() doesn't have a "Don't ask again" checkbox,
        // this typically refers to the browser's native "Prevent this page from creating additional dialogs".
        // If the browser blocks the dialog, confirm() may return false.
        
        const confirmed = confirm(`Remove ${planetValue} from ${resourceName}?`);
        
        // If the user cancels, stop logic. 
        // Note: If the browser is auto-blocking, we move to a custom preference model.
        if (!confirmed) return;
        
        // Optional: If you implement a custom modal with a checkbox later, 
        // you would set 'swgbuddy_skip_planet_confirm' to true here.
    }

	try {
		await API.updateResource({
			id: resource.id,
			name: resource.name,
			type: resource.type,
			planet: planetValue // Backend toggles (removes) this value if present
		});

		await loadResources(); // Refresh to update UI

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
	const resource = rawResourceData.find(r => r.name === resourceName);
	
	if (resource && window.Modal) {
		window.Modal.openDetails(resource);
	} else {
		console.error("Cannot open modal: Resource not found or Modal not loaded.");
	}
}