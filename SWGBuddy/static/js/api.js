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
        // FIX: Ensure we are using seconds (Python timestamp) not MS
        LAST_SYNC_TIMESTAMP = Date.now() / 1000; 
        
        return data;
    },

    async fetchTaxonomy() {
        // Fetches the Tree Structure
        const response = await fetch('/api/taxonomy');
        if (!response.ok) throw new Error('Failed to fetch taxonomy');
        return await response.json();
    },

    async fetchValidTypes() {
        // Fetches the Configuration (Stats/Planets/Valid Types)
        const response = await fetch('/api/types');
        if (!response.ok) throw new Error('Failed to fetch resource types configuration');
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
    },

    async updateStatus(name, isActive) {
        const data = {
            server_id: this.getServerContext(),
            name: name,
            is_active: isActive
        };
        const response = await fetch('/api/update-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Unknown error');
        return result;
    }
};