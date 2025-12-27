/**
 * Taxonomy Manager
 * Handles the resource tree structure and validity checks.
 */
let TAXONOMY_TREE = {};
let VALID_TYPES = new Set(); // Stores IDs of spawnable resources

async function loadTaxonomy() {
    try {
        const data = await API.fetchTaxonomy();
        
        // The API now returns a complex object, not just the list
        // API.fetchTaxonomy() in api.js calls 'get_init_data'
        // which returns: { taxonomy: {}, valid_types: [], servers: {}, resources: [] }
        
        // We need to parse the flat taxonomy map into the global object
        TAXONOMY_TREE = data.taxonomy;
        
        // Store valid types for the modal dropdown
        if (data.valid_types) {
            VALID_TYPES = new Set(data.valid_types);
        }

        console.log(`Taxonomy Loaded: ${Object.keys(TAXONOMY_TREE).length} entries.`);
        return TAXONOMY_TREE;
    } catch (error) {
        console.error("Failed to load taxonomy:", error);
    }
}

function getTaxonomyName(id) {
    return TAXONOMY_TREE[id] ? TAXONOMY_TREE[id].class_label : `Unknown (${id})`;
}

/**
 * Returns the attributes configuration for a specific resource type.
 * Used by modal.js to enable/disable fields.
 */
function getResourceTypeConfig(id) {
    const entry = TAXONOMY_TREE[id];
    if (!entry) return null;

    const config = {
        name: entry.class_label,
        stats: {}
    };

    // Map the attr_1...11 columns to our standard stat keys
    // Example: attr_1="OQ" -> stats.OQ = {min: 1, max: 1000}
    for (let i = 1; i <= 11; i++) {
        const attrCode = entry[`attr_${i}`]; // e.g. "OQ"
        if (attrCode) {
            config.stats[attrCode] = {
                min: entry[`att_${i}_min`],
                max: entry[`att_${i}_max`]
            };
        }
    }
    return config;
}