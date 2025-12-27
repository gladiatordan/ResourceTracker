const API = {
    // Helper to get current server from Auth module or DOM
    getServerContext() {
        return document.getElementById('server-select')?.value || 'cuemu';
    },

    async fetchResources() {
        const serverId = this.getServerContext();
        const response = await fetch(`/api/resource_log?server=${serverId}`);
        if (!response.ok) throw new Error('Failed to fetch resources');
        return await response.json();
    },

    async fetchTaxonomy() {
        const response = await fetch('/api/taxonomy');
        if (!response.ok) throw new Error('Failed to fetch taxonomy');
        return await response.json();
    },

    async addResource(data) {
        // Inject Server ID into payload
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