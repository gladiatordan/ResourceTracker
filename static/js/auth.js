const Auth = {
    user: null,
    ROLE_POWER: { 'SUPERADMIN': 100, 'ADMIN': 3, 'EDITOR': 2, 'USER': 1, 'GUEST': 0 },

    async init() {
        await this.checkSession();
        this.setupListeners();
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

    getEffectiveRole() {
        if (!this.user) return 'GUEST';
        
        // 1. Boolean Override
        if (this.user.is_superadmin) return 'SUPERADMIN';

        // 2. Server Specific
        const currentServer = this.getServerID();
        const serverRole = this.user.server_perms ? this.user.server_perms[currentServer] : null;
        
        return serverRole || 'USER'; // Default to USER if logged in but no specific role
    },

    renderAuthUI() {
        const authSection = document.getElementById('auth-section');
        const addBtn = document.querySelector('.add-resource-btn');
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
                this.renderAuthUI(); 
                window.location.reload(); 
            });
        }
    },

    getServerID() {
        // FIX: Check localStorage as fallback if the DOM isn't ready or defaults to cuemu
        const domVal = document.getElementById('server-select')?.value;
        const storedVal = localStorage.getItem('swg_server_id');
        return domVal || storedVal || 'cuemu';
    }
};

document.addEventListener('DOMContentLoaded', () => Auth.init());