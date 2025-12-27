const Auth = {
    user: null,
    // Power Levels: Higher overrides lower
    ROLE_POWER: { 'SUPERADMIN': 100, 'ADMIN': 3, 'EDITOR': 2, 'USER': 1, 'GUEST': 0 },

    async init() {
        await this.checkSession();
        this.setupListeners(); // Must setup listeners first to know current server
        this.renderAuthUI();
    },

    async checkSession() {
        try {
            const response = await fetch('/api/me');
            const data = await response.json();
            if (data.authenticated) {
                this.user = data;
                console.log("User Loaded:", this.user.username);
            } else { this.user = null; }
        } catch (error) { this.user = null; }
    },

    /**
     * Determines your role for the CURRENTLY selected server.
     */
    getEffectiveRole() {
        if (!this.user) return 'GUEST';
        
        const currentServer = this.getServerID(); // e.g., 'cuemu'
        const globalRole = this.user.global_role;
        
        // 1. SuperAdmin overrides everything
        if (globalRole === 'SUPERADMIN') return 'SUPERADMIN';

        // 2. Check for specific server permission
        // server_perms looks like: { 'cuemu': 'ADMIN', 'legends': 'USER' }
        const specificRole = this.user.server_perms ? this.user.server_perms[currentServer] : null;

        // 3. Return the higher of the two (Global vs Specific)
        const globalPower = this.ROLE_POWER[globalRole] || 0;
        const specificPower = this.ROLE_POWER[specificRole] || 0;

        return specificPower > globalPower ? specificRole : globalRole;
    },

    renderAuthUI() {
        const authSection = document.getElementById('auth-section');
        const addBtn = document.querySelector('.add-resource-btn'); // Use querySelector for class
        const role = this.getEffectiveRole();

        if (this.user) {
            authSection.innerHTML = `
                <div class="user-profile">
                    <div class="user-info" style="text-align: right;">
                        <div class="username" style="font-family: 'Orbitron'; font-size: 0.8rem;">${this.user.username}</div>
                        <div class="role-badge role-${role.toLowerCase()}" style="font-size: 0.6rem;">${role}</div>
                    </div>
                    <img src="https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.png" class="user-avatar" alt="User">
                    <a href="/logout" class="btn-logout" style="margin-left: 5px;"><i class="fa-solid fa-sign-out-alt"></i></a>
                </div>`;
            
            // Show Add Button only if EDITOR or higher (Level 2+)
            if (addBtn) {
                const power = this.ROLE_POWER[role] || 0;
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
            const saved = localStorage.getItem('swg_server_id');
            if (saved) serverSelect.value = saved;

            serverSelect.addEventListener('change', (e) => {
                localStorage.setItem('swg_server_id', e.target.value);
                // Re-render because role might change when switching servers!
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