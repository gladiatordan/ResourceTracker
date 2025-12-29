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
		// UNIFIED CALL: Use updateResource instead of specific endpoint
		await API.updateResource({
			id: resource.id,
			name: resource.name,
			type: resource.type, // <--- CRITICAL: Required for validation lookup
			is_active: newState
		});
		
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

	if (!resource.planets) resource.planets = [];
	if (!resource.planets.includes(newPlanet)) {
		resource.planets.push(newPlanet);
	}

	try {
		await API.updateResource({
			id: resource.id,
			name: resource.name,
			type: resource.type, // <--- CRITICAL
			planet: newPlanet
		});

		selectElement.value = "";
		if (typeof applyAllTableTransforms === 'function') {
			applyAllTableTransforms();
		}
	} catch (error) {
		console.error("Failed to add planet:", error);
		alert("Error: " + error.message);
	}
}

async function handleBadgeClick(event, resourceName, planetValue) {
	// 1. Prevent bubbling (don't open details modal)
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    // 2. Permission Check (Guests can see badges but not click them)
    if (!window.Auth || !Auth.hasPermission('USER')) return;

    const resource = rawResourceData.find(r => r.name === resourceName);
    if (!resource) return;

    // 3. Confirmation
    if (!confirm(`Remove ${planetValue} from ${resourceName}?`)) return;

    // 4. Optimistic Update (Remove locally)
    if (resource.planets) {
        resource.planets = resource.planets.filter(p => p !== planetValue);
    }

    try {
        // 5. Send API Request (Backend toggles it off because it exists)
        await API.updateResource({
            id: resource.id,
            name: resource.name,
            type: resource.type, 
            planet: planetValue
        });

        // 6. Refresh Table
        if (typeof applyAllTableTransforms === 'function') {
            applyAllTableTransforms();
        }

    } catch (error) {
        console.error("Failed to remove planet:", error);
        alert("Error removing planet: " + error.message);
        await loadResources(); // Revert state
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