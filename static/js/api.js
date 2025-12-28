/**
 * API Wrapper
 */
const API = {
    getServerContext() {
        return document.getElementById('server-select')?.value || 'cuemu';
    },

    async fetchResources(isDelta = false) {
        const serverId = this.getServerContext();
        
        // If it's a full refresh (not delta), reset timestamp
        if (!isDelta) LAST_SYNC_TIMESTAMP = 0;

        const response = await fetch(`/api/resource_log?server=${serverId}&since=${LAST_SYNC_TIMESTAMP}`);
        if (!response.ok) throw new Error('Failed to fetch resources');
        
        const data = await response.json();

        // Update timestamp for next time
        // We use the current server time if provided, or client time as fallback
        LAST_SYNC_TIMESTAMP = Date.now() / 1000; 
        
        return data;
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