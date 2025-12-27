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
    currentResourceId: null,

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
        });

        // Handle Submit
        this.elements.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submit();
        });
    },

    openAdd() {
        this.mode = 'add';
        this.currentResourceId = null;
        this.elements.title.textContent = "Report New Resource";
        this.resetForm();
        this.populateTypeDropdown();
        this.populatePlanets(); // Ensure planets are loaded
        
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

        // Filter TAXONOMY_TREE using VALID_TYPES set
        // Sort alphabetically for better UX
        const sortedTypes = Array.from(VALID_TYPES)
            .map(id => ({ id: id, name: TAXONOMY_TREE[id].class_label }))
            .sort((a, b) => a.name.localeCompare(b.name));

        sortedTypes.forEach(type => {
            const opt = document.createElement('option');
            opt.value = type.id;
            opt.textContent = type.name;
            select.appendChild(opt);
        });
    },

    populatePlanets() {
        // TODO: Move planet list to config or DB
        const planets = ["Corellia", "Dantooine", "Dathomir", "Endor", "Lok", "Naboo", "Rori", "Talus", "Tatooine", "Yavin IV"];
        const select = this.elements.planetSelect;
        if (select.children.length <= 1) { // Only populate if empty
            planets.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                select.appendChild(opt);
            });
        }
    },

    updateStatFields(typeId) {
        if (!typeId) return;

        const config = getResourceTypeConfig(typeId);
        if (!config) return;

        // Loop through all stat inputs
        Object.entries(STAT_MAPPING).forEach(([inputId, attrCode]) => {
            const input = this.elements.inputs[inputId];
            const statConfig = config.stats[attrCode];

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
                resource_class_id: this.elements.typeSelect.value,
                name: document.getElementById('res-name').value,
                planet: this.elements.planetSelect.value,
                // Server ID is handled by API wrapper from Auth context
            };

            // Add stats
            Object.keys(STAT_MAPPING).forEach(key => {
                const val = document.getElementById(key).value;
                if (val) formData[key] = parseInt(val);
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
        bar.className = `status-bar status-${type}`; // css: .status-error, .status-success
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

// Helper to inject status bar if missing from HTML
function createStatusBar() {
    const div = document.createElement('div');
    div.id = 'modal-status-bar';
    div.className = 'status-bar';
    document.querySelector('.modal-body').appendChild(div);
    return div;
}

// Global hooks for HTML onClick
window.openAddResourceModal = () => Modal.openAdd();
window.closeResourceModal = () => Modal.close(); // Need to update HTML close button

// Init on load
document.addEventListener('DOMContentLoaded', () => Modal.init());