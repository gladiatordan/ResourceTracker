/**
 * Auth Manager
 * Handles user session, profile rendering, and RBAC permission checks.
 */
const Auth = {
	user: null,
	
	// Aligns with backend validation.py
	ROLES: {
		'SUPERADMIN': 100,
		'ADMIN': 3,
		'EDITOR': 2,
		'USER': 1,
		'GUEST': 0
	},

	/**
	 * Initializes the user session. Returns promise.
	 */
	async checkSession() {
		try {
			const response = await fetch('/api/me');
			const data = await response.json();
			const authSection = document.getElementById('auth-section');

			if (data.authenticated) {
				this.user = data;
				const role = this.getCurrentRole(); 
				const roleClass = `role-${role.toLowerCase()}`;

				// New Dropdown HTML Structure
				// Show Management Link if Editor (Level 2) or higher
				// Using 'onclick' to trigger the new global function
				const showMgmt = this.hasPermission('EDITOR');
				const mgmtLink = showMgmt 
					? `<div class="dropdown-item" onclick="openServerManagement()">
						 <i class="fa-solid fa-server"></i> Server Management
					   </div>` 
					: '';

				authSection.innerHTML = `
					<div class="user-profile-container">
						<div class="user-profile">
							<img src="https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png" class="user-avatar" alt="">
							<div class="user-info">
								<span class="username">${data.username}</span>
								<span class="role-badge ${roleClass}">${role}</span>
							</div>
						</div>
						<div class="user-dropdown-menu">
							${mgmtLink}
							<a href="/logout" class="dropdown-item">
								<i class="fa-solid fa-sign-out-alt"></i> Logout
							</a>
						</div>
					</div>
				`;
			} else {
				this.user = null;
				authSection.innerHTML = `
					<a href="/login" class="btn-discord">
						<i class="fa-brands fa-discord"></i> Login
					</a>
				`;
			}
		} catch (error) {
			console.error("Session check failed:", error);
			this.user = null;
		}
	},

	/**
	 * Returns the user's role for the CURRENT selected server.
	 */
	getCurrentRole() {
		if (!this.user) return 'GUEST';
		if (this.user.is_superadmin) return 'SUPERADMIN';
		
		// Use global API context helper or fallback
		const serverId = API.getServerContext ? API.getServerContext() : 'cuemu';
		const perms = this.user.server_perms || {};
		return perms[serverId] || 'GUEST';
	},

	/**
	 * Checks if the user meets the minimum role requirement.
	 * @param {string|number} requiredLevel - Role name ('USER') or numeric level (1)
	 */
	hasPermission(requiredLevel) {
		const role = this.getCurrentRole();
		const currentLevel = this.ROLES[role] || 0;
		let req = requiredLevel;
		if (typeof requiredLevel === 'string') {
			req = this.ROLES[requiredLevel] || 0;
		}
		return currentLevel >= req;
	},
	
	/**
	 * Updates Global UI elements based on permissions.
	 * e.g. Shows/Hides "Add Resource" button.
	 */
	updateInterface() {
		const addBtn = document.getElementById('btn-add-resource');
		if (addBtn) {
			if (this.hasPermission('EDITOR')) {
				addBtn.classList.remove('hidden');
			} else {
				addBtn.classList.add('hidden');
			}
		}
		
		// Update Badge if present
		const badge = document.querySelector('.role-badge');
		if (badge && this.user) {
			const role = this.getCurrentRole();
			badge.className = `role-badge role-${role.toLowerCase()}`;
			badge.textContent = role;
		}
	}
};

window.Auth = Auth;