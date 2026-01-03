/**
 * Taxonomy Manager
 * Handles the resource tree structure, validity checks, and rendering.
 */
let TAXONOMY_TREE = []; // Array of objects
let RESOURCE_CONFIG = {}; // Map: Label -> {stats, planets}
let VALID_TYPES = new Set(); // Set of Strings (Labels)

async function loadTaxonomy() {
	try {
		// Fetch the single consolidated JSON
		const response = await fetch('/api/taxonomy');
		if (!response.ok) throw new Error("Failed to fetch taxonomy");
		
		TAXONOMY_TREE = await response.json();
		
		// Flatten for O(1) Lookup (Legacy compatibility)
		RESOURCE_CONFIG = {};
		flattenTree(TAXONOMY_TREE);

		// Expose to Global Scope
		window.TAXONOMY_TREE = TAXONOMY_TREE;
		window.validResources = RESOURCE_CONFIG;
		
		console.log(`Taxonomy Loaded. Valid Types: ${Object.keys(RESOURCE_CONFIG).length}`);
		
		renderTaxonomyDropdown();
		return TAXONOMY_TREE;

	} catch (error) {
		console.error("Failed to load taxonomy:", error);
	}
}

function flattenTree(nodes) {
	nodes.forEach(node => {
		if (node.is_valid) {
			RESOURCE_CONFIG[node.label] = {
				id: node.id,
				stats: node.stats || {},
				planets: node.planets || []
			};
		}
		if (node.children && node.children.length > 0) {
			flattenTree(node.children);
		}
	});
}

/**
 * Renders the nested dropdown for filtering.
 */
function renderTaxonomyDropdown() {
	const container = document.getElementById('taxonomy-dropdown');
	container.innerHTML = `
		<input type="text" 
               class="dropdown-search-input" 
               placeholder="Filter Category..." 
               onfocus="this.value=''; toggleDropdown(true)"
               oninput="filterTaxonomyList(this.value)">
        <div class="dropdown-list" id="taxonomy-list"></div>
	`;

	const list = document.getElementById('taxonomy-list');
	if (!list) return;

	list.innerHTML = '';

	// Root Option
	const rootDiv = document.createElement('div');
	rootDiv.className = 'dropdown-item root-item';
	rootDiv.textContent = 'All Resources';
	rootDiv.onclick = () => selectCategory(null, 'All Resources');
	list.appendChild(rootDiv);

	// Recursive Tree Builder
	const createNode = (node, depth) => {
		const container = document.createElement('div');
		
		// Row Label
		const row = document.createElement('div');
		row.className = 'dropdown-item';
		row.style.paddingLeft = (depth * 15 + 10) + 'px';
		row.style.display = 'flex';
		row.style.alignItems = 'center';

		const isLeaf = !node.children || node.children.length === 0;

		// 1. Toggle Icon
		const icon = document.createElement('span');
		icon.style.width = '20px';
		icon.style.textAlign = 'center';
		icon.style.marginRight = '5px';
		icon.style.cursor = 'pointer';
		icon.style.color = 'var(--accent-color)';
		// Default: Collapsed (Right Arrow) unless leaf
		icon.innerText = isLeaf ? '•' : '▶'; 
		
		// 2. Label Text
		const text = document.createElement('span');
		text.innerText = node.label;
		text.style.cursor = 'pointer';
		text.style.flex = '1';

		row.appendChild(icon);
		row.appendChild(text);
		container.appendChild(row);

		// 3. Children Container
		let childrenContainer = null;
		if (!isLeaf) {
			childrenContainer = document.createElement('div');
			childrenContainer.style.display = 'none'; // Default Collapsed
			
			node.children.forEach(child => {
				childrenContainer.appendChild(createNode(child, depth + 1));
			});
			container.appendChild(childrenContainer);

			// Toggle Logic
			const toggle = (e) => {
				e.stopPropagation(); // Prevent selection
				const isHidden = childrenContainer.style.display === 'none';
				childrenContainer.style.display = isHidden ? 'block' : 'none';
				icon.innerText = isHidden ? '▼' : '▶';
			};
			icon.onclick = toggle;
		}

		// Selection Logic (Clicking text selects the category)
		text.onclick = (e) => {
			// Note: Filter allows selecting Folders (e.g. "Inorganic")
			selectCategory(node.label, node.label);
		};

		return container;
	};

	TAXONOMY_TREE.forEach(node => {
		list.appendChild(createNode(node, 0));
	});
}

/**
 * Returns a flattened list of all descendant labels for a given parent label.
 * Used by filters.js to include children in filter results.
 */
function getDescendantLabels(parentLabel) {
	if (!parentLabel) return [];
	let descendants = [];
	
	function findNode(nodes, target) {
		for (const node of nodes) {
			if (node.label === target) return node;
			if (node.children) {
				const found = findNode(node.children, target);
				if (found) return found;
			}
		}
		return null;
	}

	const parentNode = findNode(TAXONOMY_TREE, parentLabel);
	
	function collect(node) {
		if (node.children) {
			node.children.forEach(child => {
				descendants.push(child.label.toLowerCase());
				collect(child);
			});
		}
	}

	if (parentNode) collect(parentNode);
	return descendants;
}

/**
 * Returns the configuration for a specific resource type.
 * Used by modal.js to enable/disable fields.
 */
function getResourceTypeConfig(label) {
	return RESOURCE_CONFIG[label] || null;
}