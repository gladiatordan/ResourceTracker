/**
 * Resource Modal Controller
 * Handles Add/Edit interactions, dynamic stat validation, and submission.
 */

// Mapping between DOM Input IDs and Taxonomy Attribute Codes
const STAT_MAPPING = {
    'res_oq': 'OQ', 'res_cd': 'CD', 'res_dr': 'DR', 'res_fl': 'FL',
    'res_hr': 'HR', 'res_ma': 'MA', 'res_pe': 'PE', 'res_sr': 'SR',
    'res_ut': 'UT', 'res_cr': 'CR'
};

const Modal = {
    isOpen: false,
    mode: 'add', // 'add' or 'edit'
    
    elements: {
        overlay: document.getElementById('resource-modal'),
        title: document.getElementById('modal-title'),
        form: document.getElementById('resource-form'),
        typeSelect: document.getElementById('res-type'),
        planetSelect: document.getElementById('res-planet'),
        inputs: {}, // Populated on init
        statusBar: document.getElementById('modal-status-bar') || createStatusBar()
    },

    init() {
        // Cache stat inputs
        Object.keys(STAT_MAPPING).forEach(id => {
            this.elements.inputs[id] = document.getElementById(id);
        });

        // Listen for Type changes to update UI
        this.elements.typeSelect.addEventListener('change', (e) => {
            this.updateStatFields(e.target.value);
            this.updatePlanetFields(e.target.value);
        });

        // Handle Submit
        this.elements.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submit();
        });
    },

    openAdd() {
        this.mode = 'add';
        this.elements.title.textContent = "Report New Resource";
        this.resetForm();
        this.populateTypeDropdown();
        this.populatePlanets(); 
        
        this.elements.overlay.classList.remove('hidden');
        this.elements.overlay.style.display = 'flex';
    },

    close() {
        this.elements.overlay.classList.add('hidden');
        this.elements.overlay.style.display = 'none';
        this.resetStatusBar();
    },

    populateTypeDropdown() {
        const select = this.elements.typeSelect;
        select.innerHTML = '<option value="">Select Resource Type...</option>';

        // Use RESOURCE_CONFIG keys (Labels)
        if (!RESOURCE_CONFIG || Object.keys(RESOURCE_CONFIG).length === 0) {
            const opt = document.createElement('option');
            opt.disabled = true;
            opt.textContent = "Loading types...";
            select.appendChild(opt);
            return;
        }

        const sortedTypes = Object.keys(RESOURCE_CONFIG).sort();

        sortedTypes.forEach(label => {
            const opt = document.createElement('option');
            opt.value = label;
            opt.textContent = label;
            select.appendChild(opt);
        });
    },

    populatePlanets(allowedPlanets = null) {
        const select = this.elements.planetSelect;
        select.innerHTML = ''; // Reset
        
        // Use Global ALL_PLANETS from config.js if no restriction
        const list = allowedPlanets || ALL_PLANETS;
        
        list.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            select.appendChild(opt);
        });
    },

    updateStatFields(label) {
        if (!label) return;

        const config = getResourceTypeConfig(label);
        if (!config) return;

        // Loop through all stat inputs
        Object.entries(STAT_MAPPING).forEach(([inputId, attrCode]) => {
            const input = this.elements.inputs[inputId];
            const statConfig = config.stats[attrCode]; // e.g. {min: 1, max: 1000}

            if (statConfig) {
                // Valid Stat
                input.disabled = false;
                input.placeholder = `${statConfig.min} - ${statConfig.max}`;
                input.min = statConfig.min;
                input.max = statConfig.max;
                input.parentElement.style.opacity = "1";
            } else {
                // Invalid Stat
                input.disabled = true;
                input.value = "";
                input.placeholder = "N/A";
                input.parentElement.style.opacity = "0.3";
            }
        });
    },
    
    updatePlanetFields(label) {
        if (!label) return;
        const config = getResourceTypeConfig(label);
        // config.planets is an array of strings e.g. ["Tatooine", "Naboo"]
        if (config && config.planets) {
            this.populatePlanets(config.planets);
        } else {
            this.populatePlanets(null); // Fallback to all
        }
    },

    async submit() {
        const btn = this.elements.form.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        
        try {
            // 1. UI Feedback
            btn.disabled = true;
            btn.textContent = "Saving...";
            this.setStatus("Submitting to database...", "info");

            // 2. Gather Data
            const formData = {
                type: this.elements.typeSelect.value, // Sending Label now
                name: document.getElementById('res-name').value,
                planets: [this.elements.planetSelect.value], // Array expected?
                // Server ID handled by API
            };
            
            // Backend might expect 'planet' (string) or 'planets' (list) depending on validation.py
            // Safe bet based on previous code: 'planet': string
            formData.planet = this.elements.planetSelect.value;

            // Add stats
            Object.keys(STAT_MAPPING).forEach(key => {
                const val = document.getElementById(key).value;
                if (val && !document.getElementById(key).disabled) {
                    formData[key] = parseInt(val);
                }
            });

            // 3. Send Request
            const result = await API.addResource(formData);

            // 4. Success Handling
            this.setStatus("Saved successfully!", "success");
            btn.textContent = "Saved!";
            
            // Refresh table
            await loadResources(); 

            // Close after short delay
            setTimeout(() => {
                this.close();
                btn.disabled = false;
                btn.textContent = originalText;
            }, 1000);

        } catch (error) {
            console.error(error);
            this.setStatus(`Error: ${error.message}`, "error");
            btn.disabled = false;
            btn.textContent = originalText;
        }
    },

    setStatus(msg, type) {
        const bar = this.elements.statusBar;
        bar.textContent = msg;
        bar.className = `status-bar status-${type}`; 
    },

    resetStatusBar() {
        this.elements.statusBar.textContent = "";
        this.elements.statusBar.className = "status-bar";
    },

    resetForm() {
        this.elements.form.reset();
        // Disable all stats initially until type is picked
        Object.values(this.elements.inputs).forEach(input => {
            input.disabled = true;
            input.parentElement.style.opacity = "0.5";
        });
    }
};

function createStatusBar() {
    const div = document.createElement('div');
    div.id = 'modal-status-bar';
    div.className = 'status-bar';
    document.querySelector('.modal-body').appendChild(div);
    return div;
}

window.openAddResourceModal = () => Modal.openAdd();
window.closeResourceModal = () => Modal.close(); 

document.addEventListener('DOMContentLoaded', () => Modal.init());