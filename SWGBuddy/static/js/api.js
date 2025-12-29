/**
 * API Wrapper
 * Centralizes all network requests to the backend.
 */
const API = {
    // Helper to get the current server context (e.g. 'cuemu')
    getServerContext() {
        return document.getElementById('server-select')?.value || 'cuemu';
    },

    /**
     * READ: Fetch Resource Log
     */
    async fetchResources(isDelta = false) {
        const serverId = this.getServerContext();
        
        // If it's a full refresh (not delta), reset timestamp
        if (!isDelta) window.LAST_SYNC_TIMESTAMP = 0;

        // Default to 0 if undefined
        const since = window.LAST_SYNC_TIMESTAMP || 0;

        const response = await fetch(`/api/resource_log?server=${serverId}&since=${since}`);
        if (!response.ok) throw new Error('Failed to fetch resources');
        
        const data = await response.json();

        // Update timestamp for next delta sync (Use Server Time / 1000 for Python compatibility)
        window.LAST_SYNC_TIMESTAMP = Date.now() / 1000; 
        
        return data;
    },

    /**
     * READ: Fetch Taxonomy Tree
     * Now the single source of truth for hierarchy AND validity rules.
     */
    async fetchTaxonomy() {
        const response = await fetch('/api/taxonomy');
        if (!response.ok) throw new Error('Failed to fetch taxonomy');
        return await response.json();
    },

    /**
     * WRITE: Add New Resource
     */
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

    /**
     * WRITE: Update Existing Resource
     * Handles Stats, Status Toggles, and Planet Changes.
     */
    async updateResource(data) {
        data.server_id = this.getServerContext();
        
        const response = await fetch('/api/update-resource', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Unknown error');
        return result;
    },

    /**
     * WRITE: Retire (Soft Delete) Resource
     */
    async retireResource(id) {
        const data = {
            id: id,
            server_id: this.getServerContext()
        };

        const response = await fetch('/api/retire-resource', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Unknown error');
        return result;
    },

    /**
     * WRITE: Set User Permissions
     */
    async setRole(targetUserId, role) {
        const data = {
            target_user_id: targetUserId,
            role: role,
            server_id: this.getServerContext()
        };

        const response = await fetch('/api/set-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Unknown error');
        return result;
    },

	/**
     * ADMIN: Force Backend Cache Reload
     */
    async reloadCache() {
        const response = await fetch('/api/admin/reload-cache', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Reload failed');
        return result;
    }
};