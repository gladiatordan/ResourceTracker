/**
 * Resource Modal Controller
 * Handles Add/Edit interactions, dynamic stat validation, and submission.
 */

const STAT_MAPPING = {
	'res_oq': 'OQ', 'res_cd': 'CD', 'res_dr': 'DR', 'res_fl': 'FL',
	'res_hr': 'HR', 'res_ma': 'MA', 'res_pe': 'PE', 'res_sr': 'SR',
	'res_ut': 'UT', 'res_cr': 'CR'
};

const Modal = {
	isSubmitting: false,
	currentId: null, // Tracks if we are editing
	
	elements: {
		overlay: document.getElementById('resource-modal'),
		title: document.getElementById('modal-title'),
		form: document.getElementById('resource-form'),
		typeDropdown: document.getElementById('modal-type-dropdown'),
		typeSelected: document.getElementById('modal-type-selected'),
		typeList: document.getElementById('modal-type-list'),
		typeInput: document.getElementById('res-type'),
		nameInput: document.getElementById('res-name'),
		notes: document.getElementById('res-notes'),
		inputs: {}, 
		statusBar: document.getElementById('modal-status-bar'),
		loader: document.getElementById('modal-loader')
	},

	init() {
		Object.keys(STAT_MAPPING).forEach(id => {
			const el = document.getElementById(id);
			if (el) this.elements.inputs[id] = el;
		});

		if (this.elements.typeSelected) {
			this.elements.typeSelected.addEventListener('click', (e) => {
				e.stopPropagation();
				this.toggleDropdown();
			});
		}

		document.addEventListener('click', (e) => {
			if (this.elements.typeList && this.elements.typeList.style.display === 'block') {
				if (!this.elements.typeDropdown.contains(e.target)) {
					this.elements.typeList.style.display = 'none';
				}
			}
		});

		if (this.elements.form) {
			this.elements.form.addEventListener('submit', (e) => {
				e.preventDefault();
				this.submit();
			});
		}
	},

	openAdd() {
		this.resetForm();
		this.currentId = null; // Add Mode
		this.elements.title.textContent = "REPORT RESOURCE";
		this.populateTypeTree(); 
		this.elements.overlay.classList.remove('hidden');
	},

	openEdit(resource) {
		this.resetForm();
		this.currentId = resource.id; // Edit Mode
		this.elements.title.textContent = "EDIT RESOURCE";
		this.populateTypeTree();

		// Populate Fields
		this.elements.nameInput.value = resource.name;
		this.elements.notes.value = resource.notes || "";
		
		// Populate Type
		this.selectType(resource.type);

		// Populate Stats
		Object.keys(STAT_MAPPING).forEach(key => {
			if (this.elements.inputs[key] && resource[key]) {
				this.elements.inputs[key].value = resource[key];
			}
		});

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

	populateTypeTree() {
		// ... (Existing tree builder code remains unchanged) ...
		// Ensure you copy the existing populateTypeTree function here
		// For brevity in this reply, I assume the tree logic is preserved
		const list = this.elements.typeList;
		list.innerHTML = ''; 
		if (!window.TAXONOMY_TREE || window.TAXONOMY_TREE.length === 0) return;
		
		const createNode = (node, depth) => {
			const container = document.createElement('div');
			container.className = 'modal-tree-node';
			const header = document.createElement('div');
			header.className = 'modal-tree-label';
			header.style.paddingLeft = (depth * 15 + 5) + 'px';
			const isLeaf = !node.children || node.children.length === 0;
			const isValid = window.validResources && window.validResources.hasOwnProperty(node.label);
			
			const icon = document.createElement('span');
			icon.className = 'tree-toggle';
			icon.innerText = isLeaf ? '•' : '▶'; 
			icon.style.opacity = isLeaf ? '0.3' : '1';
			header.appendChild(icon);
			
			const text = document.createElement('span');
			text.innerText = node.label;
			header.appendChild(text);
			
			let childrenContainer = null;
			if (isValid) {
				header.classList.add('selectable');
				header.addEventListener('click', () => this.selectType(node.label));
			} else if (!isLeaf) {
				header.addEventListener('click', (e) => {
					e.stopPropagation();
					if (childrenContainer) {
						childrenContainer.classList.toggle('collapsed');
						icon.innerText = childrenContainer.classList.contains('collapsed') ? '▶' : '▼';
					}
				});
			}
			container.appendChild(header);
			if (!isLeaf) {
				childrenContainer = document.createElement('div');
				childrenContainer.className = 'modal-tree-children collapsed';
				node.children.forEach(child => childrenContainer.appendChild(createNode(child, depth + 1)));
				container.appendChild(childrenContainer);
				icon.onclick = (e) => {
					e.stopPropagation();
					childrenContainer.classList.toggle('collapsed');
					icon.innerText = childrenContainer.classList.contains('collapsed') ? '▶' : '▼';
				};
			}
			return container;
		};
		window.TAXONOMY_TREE.forEach(rootNode => list.appendChild(createNode(rootNode, 0)));
	},

	selectType(label) {
		this.elements.typeInput.value = label;
		this.elements.typeSelected.innerText = label;
		this.elements.typeList.style.display = 'none';
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
				name: this.elements.nameInput.value,
				notes: this.elements.notes ? this.elements.notes.value : "",
				server_id: localStorage.getItem('swg_server_id') || 'cuemu'
			};

			// Add ID if editing
			if (this.currentId) {
				formData.id = this.currentId;
			}

			Object.keys(STAT_MAPPING).forEach(key => {
				const input = this.elements.inputs[key];
				if (input && !input.disabled && input.value) {
					formData[key] = parseInt(input.value);
				}
			});

			// Determine Endpoint
			const endpoint = this.currentId ? '/api/update-resource' : '/api/add-resource';

			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formData)
			});

			const result = await response.json();

			if (result.success) {
				this.setStatus("Saved!", "success");
				await loadResources(); 
				setTimeout(() => this.close(), 800);
			} else {
				throw new Error(result.error || "Operation Failed");
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
		this.currentId = null;
		Object.values(this.elements.inputs).forEach(input => {
			input.disabled = true;
			input.parentElement.style.opacity = "0.3";
		});
	}
};

// Global hooks
window.openAddResourceModal = () => Modal.openAdd();
window.closeResourceModal = () => Modal.close(); 
// Window.Modal is now exposed for resources.js to use
window.Modal = Modal; 

document.addEventListener('DOMContentLoaded', () => Modal.init());