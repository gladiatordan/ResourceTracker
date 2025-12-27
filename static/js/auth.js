/**
 * Auth Manager
 * Handles user session state, UI updates, and Role Enforcement.
 */
const Auth = {
    user: null,

    // Define Role Power Levels (Matches Backend)
    ROLE_POWER: {
        'SUPERADMIN': 100,
        'ADMIN': 3,
        'EDITOR': 2,
        'USER': 1,
        'GUEST': 0
    },

    async init() {
        await this.checkSession();
        this.renderAuthUI();
        this.setupListeners();
    },

    async checkSession() {
        try {
            const response = await fetch('/api/me');
            const data = await response.json();
            
            if (data.authenticated) {
                this.user = data;
                console.log(`Logged in as: ${this.user.username} [${this.user.global_role}]`);
            } else {
                this.user = null;
            }
        } catch (error) {
            console.error("Auth check failed:", error);
            this.user = null;
        }
    },

    renderAuthUI() {
        const authSection = document.getElementById('auth-section');
        const addBtn = document.getElementById('add-resource-btn');

        if (this.user) {
            // 1. Render User Profile
            authSection.innerHTML = `
                <div class="user-profile">
                    <img src="https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.png" class="user-avatar" alt="User">
                    <div class="user-info">
                        <span class="username">${this.user.username}</span>
                        <span class="role-badge role-${this.user.global_role.toLowerCase()}">${this.user.global_role}</span>
                    </div>
                    <a href="/logout" class="btn-logout" title="Logout"><i class="fa-solid fa-sign-out-alt"></i></a>
                </div>
            `;
            
            // 2. Permission Check for "Add Resource" Button
            // Only Editor (Level 2) and above can see the button
            if (addBtn) {
                if (this.hasPermission('EDITOR')) {
                    addBtn.style.display = 'block';
                } else {
                    addBtn.style.display = 'none';
                }
            }

        } else {
            // Guest Mode
            authSection.innerHTML = `
                <a href="/login" class="btn-discord">
                    <i class="fa-brands fa-discord"></i> Login
                </a>
            `;
            if (addBtn) addBtn.style.display = 'none';
        }
    },

    /**
     * Checks if current user meets the required role level
     * @param {string} requiredRole - Minimum role needed (e.g. 'EDITOR')
     */
    hasPermission(requiredRole) {
        if (!this.user) return false;
        
        const userLevel = this.ROLE_POWER[this.user.global_role] || 1;
        const reqLevel = this.ROLE_POWER[requiredRole] || 100;
        
        return userLevel >= reqLevel;
    },

    setupListeners() {
        const serverSelect = document.getElementById('server-select');
        if (serverSelect) {
            const savedServer = localStorage.getItem('swg_server_id');
            if (savedServer) serverSelect.value = savedServer;

            serverSelect.addEventListener('change', (e) => {
                localStorage.setItem('swg_server_id', e.target.value);
                window.location.reload(); 
            });
        }
    },

    getServerID() {
        return document.getElementById('server-select')?.value || 'cuemu';
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
});