/**
 * API Wrapper
 */
const API = {
    getServerContext() {
        return document.getElementById('server-select')?.value || 'cuemu';
    },

    async fetchResources(sinceTimestamp = 0) {
        const serverId = this.getServerContext();
        // Pass 'since' to backend. Backend logic will use it to filter delta.
        const response = await fetch(`/api/resource_log?server=${serverId}&since=${sinceTimestamp}`);
        if (!response.ok) throw new Error('Failed to fetch resources');
        
        // Return full response object { taxonomy, valid_types, resources, etc }
        return await response.json(); 
    },

    async fetchTaxonomy() {
        // Taxonomy is static, no delta needed
        const response = await fetch('/api/taxonomy');
        if (!response.ok) throw new Error('Failed to fetch taxonomy');
        return await response.json();
    },

    async addResource(data) {
        data.server_id = this.getServerContext();
        const response = await fetch('/api/add-resource', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Unknown error');
        return result;
    }
};