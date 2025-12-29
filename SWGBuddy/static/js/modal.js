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
        
        // Dropdown Elements
        typeDropdown: document.getElementById('modal-type-dropdown'),
        typeSelected: document.getElementById('modal-type-selected'),
        typeList: document.getElementById('modal-type-list'),
        typeInput: document.getElementById('res-type'),
        
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

        // Setup Dropdown Toggling
        if (this.elements.typeSelected) {
            this.elements.typeSelected.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown();
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.elements.typeList && this.elements.typeList.style.display === 'block') {
                if (!this.elements.typeDropdown.contains(e.target)) {
                    this.elements.typeList.style.display = 'none';
                }
            }
        });

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
        this.populateTypeTree(); // Use new tree builder
        this.elements.overlay.classList.remove('hidden');
    },

    close() {
        if (this.isSubmitting) return; 
        this.elements.overlay.classList.add('hidden');
        this.resetStatusBar();
    },

    toggleDropdown() {
        const list = this.elements.typeList;
        list.style.display = list.style.display === 'block' ? 'none' : 'block';
    },

    // Build the hierarchical tree
    populateTypeTree() {
        const list = this.elements.typeList;
        list.innerHTML = ''; 

        if (!window.TAXONOMY_TREE || window.TAXONOMY_TREE.length === 0) {
            list.innerHTML = '<div style="padding:10px">Loading types...</div>';
            return;
        }

        // Recursive Node Builder
        const createNode = (node, depth) => {
            const container = document.createElement('div');
            container.className = 'modal-tree-node';

            const header = document.createElement('div');
            header.className = 'modal-tree-label';
            header.style.paddingLeft = (depth * 15 + 5) + 'px';

            const isLeaf = !node.children || node.children.length === 0;
            // Check validity map
            const isValid = window.validResources && window.validResources.hasOwnProperty(node.label);

            // 1. Icon (Toggle for folders, Dot for leaves)
            const icon = document.createElement('span');
            icon.className = 'tree-toggle';
            icon.innerText = isLeaf ? '•' : '▶'; 
            icon.style.opacity = isLeaf ? '0.3' : '1';
            header.appendChild(icon);

            // 2. Text
            const text = document.createElement('span');
            text.innerText = node.label;
            header.appendChild(text);

            // 3. Logic
            let childrenContainer = null;

            if (isValid) {
                // If it's a valid type, clicking the ROW selects it
                header.classList.add('selectable');
                header.addEventListener('click', () => {
                    this.selectType(node.label);
                });
            } else if (!isLeaf) {
                // If it's a generic folder (e.g. "Inorganic"), clicking text toggles it
                header.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (childrenContainer) {
                        childrenContainer.classList.toggle('collapsed');
                        icon.innerText = childrenContainer.classList.contains('collapsed') ? '▶' : '▼';
                    }
                });
            }

            container.appendChild(header);

            // 4. Children
            if (!isLeaf) {
                childrenContainer = document.createElement('div');
                childrenContainer.className = 'modal-tree-children collapsed'; // Expanded by default
                
                node.children.forEach(child => {
                    childrenContainer.appendChild(createNode(child, depth + 1));
                });
                container.appendChild(childrenContainer);

                // Make the icon always toggle the children, even if the row is selectable
                icon.onclick = (e) => {
                    e.stopPropagation();
                    childrenContainer.classList.toggle('collapsed');
                    icon.innerText = childrenContainer.classList.contains('collapsed') ? '▶' : '▼';
                };
            }

            return container;
        };

        // Build Root Nodes
        window.TAXONOMY_TREE.forEach(rootNode => {
            list.appendChild(createNode(rootNode, 0));
        });
    },

    selectType(label) {
        // Update hidden input and display text
        this.elements.typeInput.value = label;
        this.elements.typeSelected.innerText = label;
        this.elements.typeList.style.display = 'none';

        // Update stats
        this.updateStatFields(label);
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

        // Validation
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

        if (!this.elements.typeInput.value) {
            alert("Please select a resource type.");
            return;
        }

        try {
            this.isSubmitting = true;
            this.elements.loader.classList.remove('hidden');
            this.setStatus("", "");

            const formData = {
                type: this.elements.typeInput.value,
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
        this.elements.typeInput.value = "";
        this.elements.typeSelected.innerText = "Select Resource Type...";
        this.isSubmitting = false;
        this.elements.loader.classList.add('hidden');
        
        // Disable stats initially
        Object.values(this.elements.inputs).forEach(input => {
            input.disabled = true;
            input.parentElement.style.opacity = "0.3";
        });
    }
};

window.openAddResourceModal = () => Modal.openAdd();
window.closeResourceModal = () => Modal.close(); 

document.addEventListener('DOMContentLoaded', () => Modal.init());