/* Modal Logic for SWGBuddy 
    Handles opening, closing, and submitting the resource form.
*/

// Mapping of Stat Keys to DOM IDs
const STAT_KEYS = ['res_oq', 'res_cd', 'res_dr', 'res_fl', 'res_hr', 'res_ma', 'res_pe', 'res_sr', 'res_ut', 'res_cr'];
let isSubmitting = false;

function openAddResourceModal() {
    // 1. Reset Form
    document.getElementById('resource-form').reset();
    document.getElementById('modal-title').innerText = "REPORT RESOURCE";
    document.getElementById('modal-status-bar').innerText = "";
    document.getElementById('modal-status-bar').className = "status-bar";
    
    // 2. Populate Types (if empty)
    populateTypeDropdown();

    // 3. Trigger initial stat toggle based on default selection
    handleTypeChange();

    // 4. Show Modal
    const modal = document.getElementById('resource-modal');
    modal.classList.remove('hidden');
}

function closeResourceModal() {
    document.getElementById('resource-modal').classList.add('hidden');
}

/* Populates the Dropdown. 
   Depends on 'window.validResources' being loaded by api.js or resources.js first.
*/
function populateTypeDropdown() {
    const select = document.getElementById('res-type');
    if (select.options.length > 0) return; // Already populated

    // Sort alphabetically
    const types = Object.keys(window.validResources || {}).sort();
    
    types.forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.innerText = type;
        select.appendChild(opt);
    });
}

/* Dynamic Stat Toggling 
   Reads the selected type and disables stats that aren't valid for it.
*/
function handleTypeChange() {
    const type = document.getElementById('res-type').value;
    const rules = window.validResources ? window.validResources[type] : null;
    
    if (!rules) return;

    STAT_KEYS.forEach(stat => {
        const input = document.getElementById(stat);
        // If the stat exists in the rules definition, enable it. Otherwise disable.
        const isEnabled = rules.stats && rules.stats.hasOwnProperty(stat);
        
        input.disabled = !isEnabled;
        
        if (!isEnabled) {
            input.value = ""; // Clear invalid data
            input.placeholder = "-";
        } else {
            input.placeholder = "";
        }
    });
}

/* Form Submission */
document.getElementById('resource-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const loader = document.getElementById('modal-loader');
    const statusDiv = document.getElementById('modal-status-bar');

    // 1. Client-Side Validation (Integers 1-1000)
    for (let stat of STAT_KEYS) {
        const input = document.getElementById(stat);
        if (!input.disabled && input.value) {
            const val = parseInt(input.value);
            if (isNaN(val) || val < 1 || val > 1000) {
                alert(`Error: ${stat.toUpperCase().replace('RES_', '')} must be between 1 and 1000.`);
                input.focus();
                return;
            }
        }
    }

    // 2. Prepare Payload
    const payload = {
        name: document.getElementById('res-name').value,
        type: document.getElementById('res-type').value,
        notes: document.getElementById('res-notes').value, // Notes are sent as string
        server_id: localStorage.getItem('swg_server_id') || 'cuemu'
    };

    STAT_KEYS.forEach(key => {
        const val = document.getElementById(key).value;
        if (val) payload[key] = parseInt(val);
    });

    // 3. Show Loading State
    isSubmitting = true;
    loader.classList.remove('hidden'); // Show Spinner
    statusDiv.innerText = "";

    try {
        const response = await fetch('/api/add-resource', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.success) {
            // Success!
            closeResourceModal();
            // Refresh grid
            if (typeof loadResources === 'function') loadResources(); 
        } else {
            // Server Error
            statusDiv.innerText = "Error: " + (result.error || "Unknown error");
            statusDiv.className = "status-bar status-error";
        }
    } catch (err) {
        statusDiv.innerText = "Network Error: " + err.message;
        statusDiv.className = "status-bar status-error";
    } finally {
        isSubmitting = false;
        loader.classList.add('hidden'); // Hide Spinner
    }
});

// Close modal when clicking outside content
document.getElementById('resource-modal').addEventListener('click', (e) => {
    if (e.target.id === 'resource-modal') closeResourceModal();
});