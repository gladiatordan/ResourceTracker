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
		const response = await fetch('/assets/resource_taxonomy.json');
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
	const list = document.getElementById('taxonomy-list');
	if (!list) return;

	// Reset list with just the Root option
	list.innerHTML = `<div class="dropdown-item root-item" onclick="selectCategory(null, 'All Resources')">All Resources</div>`;

	// Recursive render
	function buildHtml(nodes, depth) {
		let html = '';
		nodes.forEach(node => {
			const padding = depth * 15;
			// Use label as the identifier now
			const safeLabel = node.label.replace(/'/g, "\\'");
			
			html += `<div class="dropdown-item" 
						  style="padding-left: ${padding}px;" 
						  onclick="selectCategory('${safeLabel}', '${safeLabel}')">
						  ${node.label}
					 </div>`;
			
			if (node.children && node.children.length > 0) {
				html += buildHtml(node.children, depth + 1);
			}
		});
		return html;
	}

	list.innerHTML += buildHtml(TAXONOMY_TREE, 1);
}

/**
 * Returns a flattened list of all descendant labels for a given parent label.
 * Used by filters.js to include children in filter results.
 */
function getDescendantLabels(parentLabel) {
	if (!parentLabel) return [];
	
	let descendants = [];
	
	// Recursive search to find the node
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
	
	// Collect all children recursively
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