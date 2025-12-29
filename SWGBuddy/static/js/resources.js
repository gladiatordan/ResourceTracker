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
		// FIX: Send full object so validation.py can recalculate ratings
		const payload = { ...resource, is_active: newState };
		
		// FIX: Remove planet fields entirely for status updates.
		// This prevents the backend from triggering "Replace Planet List" logic,
		// avoiding race conditions or accidental overwrites.
		delete payload.planet;
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

	try {
		// FIX: Send full object (stats) + new planet string
		// Sending 'planet' as a String triggers the atomic Toggle logic in backend
		const payload = {
			...resource,
			planet: newPlanet 
		};

		await API.updateResource(payload);

		selectElement.value = "";
		// Reload is required to get the sorted/verified list from DB
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

	if (!window.Auth || !Auth.hasPermission('USER')) return;

	const resource = rawResourceData.find(r => r.name === resourceName);
	if (!resource) return;

	// Check "Don't Prompt" preference
	const skipConfirmation = localStorage.getItem('swgbuddy_skip_planet_confirm') === 'true';

	if (!skipConfirmation) {
		if (!confirm(`Remove ${planetValue} from ${resourceName}?`)) return;
	}

	try {
		const payload = {
			...resource,
			planet: planetValue // Triggers toggle (remove if present)
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
	const resource = rawResourceData.find(r => r.name === resourceName);
	
	if (resource && window.Modal) {
		window.Modal.openDetails(resource);
	} else {
		console.error("Cannot open modal: Resource not found or Modal not loaded.");
	}
}