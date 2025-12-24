async function loadResources() {
    try {
        const response = await fetch('/api/resource_log');
        rawResourceData = await response.json();
        // applyAllTableTransforms is defined in resources.js
        applyAllTableTransforms(); 
    } catch (error) {
        console.error("Error loading resources:", error);
    }
}

async function loadTaxonomy() {
    try {
        const response = await fetch('/api/taxonomy');
        taxonomyData = await response.json();
        initTaxonomyDropdown(); // Defined in taxonomy.js
    } catch (error) {
        console.error("Error loading taxonomy:", error);
    }
}