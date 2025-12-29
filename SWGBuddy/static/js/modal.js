/**
 * Resource Modal Controller
 * Handles 3 Modes: ADD, DETAILS, EDIT
 */

const STAT_MAPPING = {
	'res_oq': 'OQ', 'res_cd': 'CD', 'res_dr': 'DR', 'res_fl': 'FL',
	'res_hr': 'HR', 'res_ma': 'MA', 'res_pe': 'PE', 'res_sr': 'SR',
	'res_ut': 'UT', 'res_cr': 'CR'
};

const Modal = {
	mode: 'DETAILS', // ADD, DETAILS, EDIT
	currentResource: null,
	originalData: {},
	isSubmitting: false,
	
	elements: {
		overlay: document.getElementById('resource-modal'),
		title: document.getElementById('modal-title'),
		form: document.getElementById('resource-form'),
		
		// Inputs
		nameInput: document.getElementById('res-name'),
		notesInput: document.getElementById('res-notes'),
		typeInput: document.getElementById('res-type'),
		inputs: {}, // Populated in init
		
		// Containers
		typeDropdown: document.getElementById('modal-type-dropdown'),
		typeDisplay: document.getElementById('res-type-display'),
		statsEdit: document.getElementById('stats-container-edit'),
		statsView: document.getElementById('stats-container-view'),
		metaContainer: document.getElementById('meta-container'),
		
		// Buttons
		btnEdit: document.getElementById('btn-modal-edit'),
		btnSave: document.getElementById('btn-modal-save'),
		btnCancel: document.getElementById('btn-modal-cancel'),
		
		// Status
		statusBar: document.getElementById('modal-status-bar'),
		loader: document.getElementById('modal-loader')
	},

	init() {
		Object.keys(STAT_MAPPING).forEach(id => {
			const el = document.getElementById(id);
			if (el) {
				this.elements.inputs[id] = el;
				// Add dirty check listener
				el.addEventListener('input', () => this.checkDirty());
			}
		});

		// Other Dirty Check Listeners
		this.elements.nameInput.addEventListener('input', () => this.checkDirty());
		this.elements.notesInput.addEventListener('input', () => this.checkDirty());
		
		// Dropdown toggle
		document.getElementById('modal-type-selected').addEventListener('click', (e) => {
			e.stopPropagation();
			if (this.mode !== 'DETAILS') this.toggleDropdown();
		});

		// Form Submit
		this.elements.form.addEventListener('submit', (e) => {
			e.preventDefault();
			this.submit();
		});
		
		// Close dropdown on click out
		document.addEventListener('click', (e) => {
			const list = document.getElementById('modal-type-list');
			if (list.style.display === 'block' && !this.elements.typeDropdown.contains(e.target)) {
				list.style.display = 'none';
			}
		});
	},

	// --- ENTRY POINTS ---

	openAdd() {
		this.resetState();
		this.mode = 'ADD';
		this.elements.title.textContent = "Report Resource";
		
		this.populateTypeTree();
		this.renderState();
		this.elements.overlay.classList.remove('hidden');
	},

	openDetails(resource) {
		this.resetState();
		this.mode = 'DETAILS';
		this.currentResource = resource;
		this.originalData = { ...resource }; // Clone for reference
		
		this.populateTypeTree(); // Needed for edit mode transition
		this.populateFields(resource);
		this.renderState();
		this.elements.overlay.classList.remove('hidden');
	},

	enterEditMode() {
		this.mode = 'EDIT';
		this.originalData = this.captureCurrentFormData(); // Snapshot current inputs
		this.renderState();
		this.checkDirty(); // Should be disabled initially
	},

	// --- STATE RENDERING ---

	renderState() {
		const els = this.elements;
		const res = this.currentResource || {};
		
		// 1. Header Title
		if (this.mode === 'EDIT') els.title.textContent = `Edit Resource - ${res.name}`;
		else if (this.mode === 'DETAILS') els.title.textContent = `Details - ${res.name}`;
		else els.title.textContent = "Report Resource";

		// 2. Visibility Toggles
		const isEditable = (this.mode === 'ADD' || this.mode === 'EDIT');
		const isDetails = (this.mode === 'DETAILS');

		// Type
		els.typeDropdown.classList.toggle('hidden', isDetails);
		els.typeDisplay.classList.toggle('hidden', !isDetails);
		if (isDetails) els.typeDisplay.textContent = res.type;

		// Stats
		els.statsEdit.classList.toggle('hidden', isDetails);
		els.statsView.classList.toggle('hidden', !isDetails);
		document.getElementById('stats-label').textContent = isDetails ? "Stats" : "Enter Stats (Stats not applicable to this type are disabled)";
		
		if (isDetails) this.renderStatsView(res);
		else this.updateStatFields(document.getElementById('res-type').value);

		// Meta Data
		els.metaContainer.classList.toggle('hidden', this.mode === 'ADD');
		if (this.mode !== 'ADD') this.renderMetaData(res);

		// Inputs ReadOnly Status
		els.nameInput.disabled = (this.mode === 'DETAILS'); 
		els.notesInput.disabled = (this.mode === 'DETAILS');
		els.notesInput.classList.toggle('static-value', isDetails); 

		// 3. Buttons Logic
		// FIX: Check for EDITOR permission (Level 2), not just USER (Level 1)
		const canEditRole = window.Auth && Auth.hasPermission('EDITOR');
		
		// Edit Details Button
		if (this.mode === 'DETAILS') {
			els.btnEdit.classList.remove('hidden');
			els.btnEdit.disabled = !canEditRole; // Disabled if not at least Editor
		} else if (this.mode === 'EDIT') {
			els.btnEdit.classList.remove('hidden');
			els.btnEdit.disabled = true; // Disabled while editing
		} else {
			els.btnEdit.classList.add('hidden'); // Hidden in Add mode
		}

		// Save Button
		if (this.mode === 'DETAILS') {
			els.btnSave.disabled = true;
		} else if (this.mode === 'ADD') {
			els.btnSave.disabled = false; 
		} 
		// Edit mode save state is handled by checkDirty()

		// Cancel Button
		els.btnCancel.disabled = (this.mode === 'DETAILS'); // Disabled in View-only
	},

	renderStatsView(res) {
		const container = this.elements.statsView;
		container.innerHTML = '';
		
		Object.keys(STAT_MAPPING).forEach(key => {
			const val = res[key];
			if (val && val > 0) {
				const rating = res[key + '_rating'] || 0;
				const colorClass = getStatColorClass(rating); // Global helper
				const pct = (rating * 100).toFixed(1) + '%';
				
				const div = document.createElement('div');
				div.className = `stat-box ${colorClass}`;
				div.title = `Rating: ${pct}`;
				div.innerHTML = `<label>${STAT_MAPPING[key]}</label><span class="stat-value">${val}</span>`;
				container.appendChild(div);
			}
		});
	},

	renderMetaData(res) {
		document.getElementById('res-date').textContent = formatDate(res.date_reported);
		document.getElementById('res-reporter').textContent = res.reporter_name || "Unknown";
		
		// Planets
		const planets = (res.planets || []).join(', ') || "None";
		document.getElementById('res-planets').textContent = planets;
		
		// Status
		const statusDiv = document.getElementById('res-status');
		statusDiv.innerHTML = `<span class="status-text ${res.is_active ? 'active' : 'inactive'}">${res.is_active ? 'Active' : 'Inactive'}</span>`;
	},

	populateFields(res) {
		this.elements.nameInput.value = res.name;
		this.elements.notesInput.value = res.notes || "";
		this.elements.typeInput.value = res.type;
		document.getElementById('modal-type-selected').textContent = res.type;

		Object.keys(STAT_MAPPING).forEach(key => {
			const input = this.elements.inputs[key];
			if (input) input.value = res[key] || "";
		});
	},

	// --- ACTIONS ---

	cancel() {
		if (this.mode === 'ADD') {
			this.close();
		} else if (this.mode === 'EDIT') {
			// Revert to Details
			this.openDetails(this.currentResource);
		}
	},

	close() {
		this.elements.overlay.classList.add('hidden');
	},

	async submit() {
		if (this.isSubmitting) return;
		
		// Validation (1-1000)
		for (const [id, input] of Object.entries(this.elements.inputs)) {
			if (!input.disabled && input.value) {
				const val = parseInt(input.value);
				if (isNaN(val) || val < 1 || val > 1000) {
					alert(`${STAT_MAPPING[id]} must be between 1 and 1000.`);
					return;
				}
			}
		}

		try {
			this.isSubmitting = true;
			this.elements.loader.classList.remove('hidden');
			
			const formData = this.captureCurrentFormData();
			
			if (this.mode === 'EDIT') {
				formData.id = this.currentResource.id;
				await API.updateResource(formData);
				// Update local model implicitly by re-fetching or merging
				// For simplicity, we assume success means backend is updated
			} else {
				await API.addResource(formData);
			}

			// Success -> Reload Data -> Switch to Details
			await loadResources(); 
			
			// Find the fresh object to display Details Mode correctly
			const freshRes = rawResourceData.find(r => r.name === formData.name);
			if (freshRes) {
				this.openDetails(freshRes);
			} else {
				this.close(); // Fallback
			}

		} catch (error) {
			this.elements.statusBar.textContent = "Error: " + error.message;
			this.elements.statusBar.className = "status-bar status-error";
		} finally {
			this.isSubmitting = false;
			this.elements.loader.classList.add('hidden');
		}
	},

	// --- HELPERS ---

	captureCurrentFormData() {
		const data = {
			name: this.elements.nameInput.value,
			type: this.elements.typeInput.value,
			notes: this.elements.notesInput.value,
			server_id: API.getServerContext()
		};
		
		Object.keys(STAT_MAPPING).forEach(key => {
			const input = this.elements.inputs[key];
			if (input && !input.disabled && input.value) {
				data[key] = parseInt(input.value);
			}
		});
		return data;
	},

	checkDirty() {
		if (this.mode !== 'EDIT') return;
		
		const current = this.captureCurrentFormData();
		// Simple comparison. Note: originalData might have extra fields like 'id', ignore them.
		let isDirty = false;
		
		if (current.name !== this.originalData.name) isDirty = true;
		if (current.notes !== (this.originalData.notes || "")) isDirty = true;
		if (current.type !== this.originalData.type) isDirty = true;
		
		Object.keys(STAT_MAPPING).forEach(key => {
			const oldVal = this.originalData[key] || "";
			const newVal = current[key] || "";
			// Compare as strings to handle "500" vs 500
			if (oldVal.toString() !== newVal.toString()) isDirty = true;
		});

		this.elements.btnSave.disabled = !isDirty;
	},

	populateTypeTree() {
		// ... (Existing Tree Builder Logic - Kept same as previous) ...
		const list = document.getElementById('modal-type-list');
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
		if (this.mode === 'DETAILS') return; // Read only
		this.elements.typeInput.value = label;
		document.getElementById('modal-type-selected').textContent = label;
		document.getElementById('modal-type-list').style.display = 'none';
		this.updateStatFields(label);
		this.checkDirty();
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
	
	toggleDropdown() {
		const list = document.getElementById('modal-type-list');
		list.style.display = list.style.display === 'block' ? 'none' : 'block';
	},
	
	resetState() {
		this.elements.form.reset();
		this.elements.statusBar.textContent = "";
		this.elements.statusBar.className = "status-bar";
		this.elements.loader.classList.add('hidden');
		this.isSubmitting = false;
		// Default visuals
		document.getElementById('modal-type-selected').textContent = "Select Resource Type...";
	}
};

window.openAddResourceModal = () => Modal.openAdd();
window.closeResourceModal = () => Modal.close();
window.Modal = Modal; // Expose for resources.js

document.addEventListener('DOMContentLoaded', () => Modal.init());