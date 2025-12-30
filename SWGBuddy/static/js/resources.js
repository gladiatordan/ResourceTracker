/**
 * Resource Logic
 * Handles data fetching, status toggling, and row refreshing.
 */

// Global Store


/**
 * Main Loader Function
 */
async function loadResources(isDelta = false) {
	try {
		const dataPacket = await API.fetchResources(isDelta); 
		const newResources = dataPacket.resources || [];
		
		if (isDelta) {
			// MERGE LOGIC: Update existing, Append new
			if (newResources.length > 0) {
				console.log(`Delta Sync: Received ${newResources.length} updates.`);
				newResources.forEach(updatedRes => {
					const idx = rawResourceData.findIndex(r => r.id === updatedRes.id);
					if (idx !== -1) {
						// Update existing entry
						rawResourceData[idx] = updatedRes;
					} else {
						// Append new entry
						rawResourceData.push(updatedRes);
					}
				});
				// Only re-render if we actually changed data
				if (typeof applyAllTableTransforms === 'function') {
					applyAllTableTransforms();
					toggleSort();
				}
			}
		} else {
			// FULL LOAD: Overwrite
			rawResourceData = newResources;
			console.log(`Full Sync: Loaded ${rawResourceData.length} resources.`);
			
			if (typeof applyAllTableTransforms === 'function') {
				applyAllTableTransforms();
				toggleSort();
			}
		}

		// Reset the timer after every successful load (auto or manual)
		resetPolling();
		
	} catch (error) {
		console.error("Failed to load resources:", error);
	}
}

// ------------------------------------------------------------------
// INITIALIZATION & POLLING
// ------------------------------------------------------------------

/**
 * Resets the polling timer.
 * Only schedules the next poll if the resource table is currently visible.
 */
function resetPolling() {
    if (pollingTimer) clearTimeout(pollingTimer);
    
    pollingTimer = setTimeout(() => {
        const tableBody = document.getElementById('resource-log-body');
        // Check if table is present and visible (offsetParent is null if display: none)
        if (tableBody && tableBody.offsetParent !== null) {
            loadResources(true);
        }
    }, POLL_INTERVAL);
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
		const payload = { ...resource, is_active: newState };
		delete payload.planet;
		delete payload.planets;

		await API.updateResource(payload);
		
		resource.is_active = newState;
		
		// Trigger a delta sync to ensure consistency (e.g. last_modified timestamp)
		loadResources(true);

	} catch (error) {
		console.error("Failed to save status:", error);
		// Revert UI
		statusSpan.textContent = currentlyActive ? "Active" : "Inactive";
		statusSpan.className = `status-text ${currentlyActive ? 'active' : 'inactive'}`;
		alert("Failed: " + error.message);
	}
	// toggleSort();
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

	try {
		const payload = {
			...resource,
			planet: newPlanet 
		};

		await API.updateResource(payload);

		selectElement.value = "";
		// Efficient Delta Reload
		await loadResources(true); 
		
	} catch (error) {
		console.error("Failed to add planet:", error);
		alert("Error: " + error.message);
	}
	// toggleSort();
}

async function handleBadgeClick(event, resourceName, planetValue) {
	if (event) {
		event.preventDefault();
		event.stopPropagation();
	}

	if (!window.Auth || !Auth.hasPermission('EDITOR')) return;

	const resource = rawResourceData.find(r => r.name === resourceName);
	if (!resource) return;

	const skipConfirmation = localStorage.getItem('swgbuddy_skip_planet_confirm') === 'true';

	if (!skipConfirmation) {
		if (!confirm(`Remove ${planetValue} from ${resourceName}?`)) return;
	}

	try {
		const payload = {
			...resource,
			planet: planetValue 
		};

		await API.updateResource(payload);
		// Efficient Delta Reload
		await loadResources(true); 

	} catch (error) {
		console.error("Failed to remove planet:", error);
		alert("Error: " + error.message);
	}
	// toggleSort();
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