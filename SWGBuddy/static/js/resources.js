/**
 * Resource Logic
 * Handles data fetching, status toggling, and row refreshing.
 */

// Global Store
let rawResourceData = [];
let lastSyncTime = 0;

/**
 * Main Loader Function
 */
async function loadResources() {
	try {
		const dataPacket = await API.fetchResources(0); 
		const newResources = dataPacket.resources || [];
		
		rawResourceData = newResources;
		lastSyncTime = Date.now();

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

	// Optimistic UI update
	statusSpan.textContent = newState ? "Active" : "Inactive";
	statusSpan.className = `status-text ${newState ? 'active' : 'inactive'}`;

	try {
		// Fix: Send 'type' which is required by validation.py
		await API.updateStatus(resourceName, newState, resource.type);
		
		// Update local state
		resource.is_active = newState;
	} catch (error) {
		console.error("Failed to save status:", error);
		statusSpan.textContent = currentlyActive ? "Active" : "Inactive";
		statusSpan.className = `status-text ${currentlyActive ? 'active' : 'inactive'}`;
		alert("Failed to update status: " + error.message);
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
// PLANET MANAGEMENT
// ------------------------------------------------------------------

async function togglePlanet(selectElement, resourceName) {
	const newPlanet = selectElement.value;
	if (!newPlanet) return;

	const resource = rawResourceData.find(r => r.name === resourceName);
	if (!resource) return;

	// Add planet to local list to prevent UI lag
	if (!resource.planets) resource.planets = [];
	if (!resource.planets.includes(newPlanet)) {
		resource.planets.push(newPlanet);
	}

	try {
		// Send update to server (Requires type for validation)
		// We send the specific 'planet' field to add it
		await API.updateResource({
			id: resource.id,
			name: resource.name,
			type: resource.type,
			planet: newPlanet // ValidationService adds this to the list
		});

		// Reset dropdown and refresh row
		selectElement.value = "";
		if (typeof applyAllTableTransforms === 'function') {
			applyAllTableTransforms();
		}
	} catch (error) {
		console.error("Failed to add planet:", error);
		alert("Error adding planet: " + error.message);
	}
}

async function handleBadgeClick(event, resourceName, planetValue) {
	// Optional: Implement removal logic here if needed
	console.log(`Remove ${planetValue} from ${resourceName}`);
}

// ------------------------------------------------------------------
// MODAL BRIDGE
// ------------------------------------------------------------------

function openResourceModal(resourceName) {
	// Find the data object
	const resource = rawResourceData.find(r => r.name === resourceName);
	
	if (resource && window.Modal) {
		// Call the Modal controller to open in Edit mode
		window.Modal.openEdit(resource);
	} else {
		console.error("Cannot open modal: Resource not found or Modal not loaded.");
	}
}