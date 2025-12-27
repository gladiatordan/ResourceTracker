const Auth = {
    user: null,
    ROLE_POWER: { 'SUPERADMIN': 100, 'ADMIN': 3, 'EDITOR': 2, 'USER': 1, 'GUEST': 0 },

    async init() {
        await this.checkSession();
        this.setupListeners(); // Setup listeners first to get server ID
        this.renderAuthUI();   // Render UI based on current server
    },

    async checkSession() {
        try {
            const response = await fetch('/api/me');
            const data = await response.json();
            if (data.authenticated) {
                this.user = data;
                console.log("User Loaded:", this.user);
            } else { this.user = null; }
        } catch (error) { this.user = null; }
    },

    /**
     * Calculates the effective role for the currently selected server.
     */
    getEffectiveRole() {
        if (!this.user) return 'GUEST';
        
        const currentServer = this.getServerID();
        const serverRole = this.user.server_perms ? this.user.server_perms[currentServer] : null;
        const globalRole = this.user.global_role;

        // If SuperAdmin, always win
        if (globalRole === 'SUPERADMIN') return 'SUPERADMIN';

        // Compare power levels
        const serverPower = this.ROLE_POWER[serverRole] || 0;
        const globalPower = this.ROLE_POWER[globalRole] || 0;

        return serverPower > globalPower ? serverRole : globalRole;
    },

    renderAuthUI() {
        const authSection = document.getElementById('auth-section');
        const addBtn = document.getElementById('add-resource-btn');
        const effectiveRole = this.getEffectiveRole();

        if (this.user) {
            authSection.innerHTML = `
                <div class="user-profile">
                    <div class="user-info" style="text-align: right;">
                        <div class="username" style="font-family: 'Orbitron'; font-size: 0.8rem;">${this.user.username}</div>
                        <div class="role-badge role-${effectiveRole.toLowerCase()}" style="font-size: 0.6rem;">${effectiveRole}</div>
                    </div>
                    <img src="https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.png" class="user-avatar" alt="User">
                    <a href="/logout" class="btn-logout" style="margin-left: 5px;"><i class="fa-solid fa-sign-out-alt"></i></a>
                </div>`;
            
            // Show/Hide Add Button
            if (addBtn) {
                // Check if effective role is at least EDITOR (Level 2)
                const power = this.ROLE_POWER[effectiveRole] || 0;
                addBtn.style.display = power >= 2 ? 'block' : 'none';
            }
        } else {
            authSection.innerHTML = `<a href="/login" class="btn-discord"><i class="fa-brands fa-discord"></i> LOGIN</a>`;
            if (addBtn) addBtn.style.display = 'none';
        }
    },

    setupListeners() {
        const serverSelect = document.getElementById('server-select');
        if (serverSelect) {
            // Restore selection
            const savedServer = localStorage.getItem('swg_server_id');
            if (savedServer) serverSelect.value = savedServer;

            serverSelect.addEventListener('change', (e) => {
                localStorage.setItem('swg_server_id', e.target.value);
                // Re-render auth UI because role might change between servers
                this.renderAuthUI(); 
                window.location.reload(); 
            });
        }
    },

    getServerID() {
        return document.getElementById('server-select')?.value || 'cuemu';
    }
};

document.addEventListener('DOMContentLoaded', () => Auth.init());