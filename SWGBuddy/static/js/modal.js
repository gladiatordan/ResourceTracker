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
    isSubmitting: false,
    
    elements: {
        overlay: document.getElementById('resource-modal'),
        title: document.getElementById('modal-title'),
        form: document.getElementById('resource-form'),
        typeSelect: document.getElementById('res-type'),
        notes: document.getElementById('res-notes'),
        inputs: {}, 
        statusBar: document.getElementById('modal-status-bar'),
        loader: document.getElementById('modal-loader')
    },

    init() {
        // Cache stat inputs
        Object.keys(STAT_MAPPING).forEach(id => {
            const el = document.getElementById(id);
            if (el) this.elements.inputs[id] = el;
        });

        // Listen for Type changes to update UI
        if (this.elements.typeSelect) {
            this.elements.typeSelect.addEventListener('change', (e) => {
                this.updateStatFields(e.target.value);
            });
        }

        // Handle Submit
        if (this.elements.form) {
            this.elements.form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submit();
            });
        }
    },

    openAdd() {
        this.resetForm();
        this.elements.title.textContent = "REPORT RESOURCE";
        this.populateTypeDropdown();
        this.updateStatFields(this.elements.typeSelect.value);
        
        this.elements.overlay.classList.remove('hidden');
    },

    close() {
        if (this.isSubmitting) return; // Prevent closing while saving
        this.elements.overlay.classList.add('hidden');
        this.resetStatusBar();
    },

    populateTypeDropdown() {
        const select = this.elements.typeSelect;
        if (select.options.length > 0) return; 

        const sortedTypes = Object.keys(window.validResources || {}).sort();
        sortedTypes.forEach(label => {
            const opt = document.createElement('option');
            opt.value = label;
            opt.textContent = label;
            select.appendChild(opt);
        });
    },

    updateStatFields(label) {
        const config = window.validResources ? window.validResources[label] : null;
        
        Object.entries(STAT_MAPPING).forEach(([inputId, attrCode]) => {
            const input = this.elements.inputs[inputId];
            if (!input) return;

            const isEnabled = config && config.stats && config.stats.hasOwnProperty(inputId);

            if (isEnabled) {
                input.disabled = false;
                input.placeholder = "";
                input.parentElement.style.opacity = "1";
            } else {
                input.disabled = true;
                input.value = "";
                input.placeholder = "-";
                input.parentElement.style.opacity = "0.3";
            }
        });
    },

    async submit() {
        if (this.isSubmitting) return;

        // 1. Pre-submit Validation (1-1000)
        for (const [id, input] of Object.entries(this.elements.inputs)) {
            if (!input.disabled && input.value) {
                const val = parseInt(input.value);
                if (isNaN(val) || val < 1 || val > 1000) {
                    alert(`${STAT_MAPPING[id]} must be between 1 and 1000.`);
                    input.focus();
                    return;
                }
            }
        }

        try {
            this.isSubmitting = true;
            this.elements.loader.classList.remove('hidden');
            this.setStatus("", "");

            // 2. Gather Data
            const formData = {
                type: this.elements.typeSelect.value,
                name: document.getElementById('res-name').value,
                notes: this.elements.notes ? this.elements.notes.value : "",
                server_id: localStorage.getItem('swg_server_id') || 'cuemu'
            };

            Object.keys(STAT_MAPPING).forEach(key => {
                const input = this.elements.inputs[key];
                if (input && !input.disabled && input.value) {
                    formData[key] = parseInt(input.value);
                }
            });

            // 3. Send Request
            const response = await fetch('/api/add-resource', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
                this.setStatus("Validated and Saved!", "success");
                await loadResources(); 
                setTimeout(() => this.close(), 800);
            } else {
                throw new Error(result.error || "Validation Failed");
            }

        } catch (error) {
            this.setStatus(error.message, "error");
        } finally {
            this.isSubmitting = false;
            this.elements.loader.classList.add('hidden');
        }
    },

    setStatus(msg, type) {
        this.elements.statusBar.textContent = msg;
        this.elements.statusBar.className = `status-bar status-${type}`; 
    },

    resetStatusBar() {
        this.elements.statusBar.textContent = "";
        this.elements.statusBar.className = "status-bar";
    },

    resetForm() {
        this.elements.form.reset();
        this.isSubmitting = false;
        this.elements.loader.classList.add('hidden');
    }
};

// Global hooks
window.openAddResourceModal = () => Modal.openAdd();
window.closeResourceModal = () => Modal.close(); 

document.addEventListener('DOMContentLoaded', () => Modal.init());