/**
 * API Wrapper
 */
const API = {
	getServerContext() {
		return document.getElementById('server-select-wrapper')?.value || 'cuemu';
	},

	// --- HELPER FOR FETCH WITH HEADERS ---
	async _fetch(url, options = {}) {
		// Set CSRF header for all requests
		if (!options.headers) options.headers = {};
		options.headers['X-Requested-With'] = 'XMLHttpRequest';
		
		const response = await fetch(url, options);
		if (!response.ok) {
			let errorMessage = `Request failed: ${response.status} ${response.statusText}`;
			try {
				const errorData = await response.json();
				if (errorData && errorData.error) {
					errorMessage = errorData.error;
				}
			} catch (e) {
				// response was not JSON, stick to generic status text
			}
			// Handle generic 403s if no specific message was returned
			if (response.status === 403 && errorMessage.includes(response.statusText)) {
				errorMessage = "Access Denied or CSRF Error";
			}
			throw new Error(errorMessage);
		}
		return response;
	},

	async fetchResources(isDelta = false) {
		const serverId = this.getServerContext();
		if (!isDelta) window.LAST_SYNC_TIMESTAMP = 0;
		const since = window.LAST_SYNC_TIMESTAMP || 0;

		const response = await this._fetch(`/api/resource_log?server=${serverId}&since=${since}`);
		const data = await response.json();
		window.LAST_SYNC_TIMESTAMP = Date.now() / 1000; 
		return data;
	},

	async fetchTaxonomy() {
		const response = await this._fetch('/api/taxonomy');
		return await response.json();
	},

	async addResource(data) {
		data.server_id = this.getServerContext();
		const response = await this._fetch('/api/add-resource', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		const result = await response.json();
		if (!result.success) throw new Error(result.error || 'Unknown error');
		return result;
	},

	async updateResource(data) {
		data.server_id = this.getServerContext();
		const response = await this._fetch('/api/update-resource', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		const result = await response.json();
		if (!result.success) throw new Error(result.error || 'Unknown error');
		return result;
	},

	async retireResource(id) {
		const data = { id: id, server_id: this.getServerContext() };
		const response = await this._fetch('/api/retire-resource', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		const result = await response.json();
		if (!result.success) throw new Error(result.error || 'Unknown error');
		return result;
	},

	async setRole(targetUserId, role) {
		const data = { target_user_id: targetUserId, role: role, server_id: this.getServerContext() };
		const response = await this._fetch('/api/set-role', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		const result = await response.json();
		if (!result.success) throw new Error(result.error || 'Unknown error');
		return result;
	},

	async fetchManagedUsers(serverId) {
		const response = await this._fetch(`/api/admin/users?server=${serverId}`);
		return await response.json();
	},

	async fetchCommandLog(serverId, page=1, limit=25, search='') {
		const q = `server=${serverId}&page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
		const response = await this._fetch(`/api/admin/command-log?${q}`);
		return await response.json();
	},

	async reloadCache() {
		const response = await this._fetch('/api/admin/reload-cache', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});
		const result = await response.json();
		if (!result.success) throw new Error(result.error || 'Reload failed');
		return result;
	}
};