const Auth = {
    user: null,
    ROLE_POWER: { 'SUPERADMIN': 100, 'ADMIN': 3, 'EDITOR': 2, 'USER': 1, 'GUEST': 0 },

    async init() {
        console.log("Auth: Initializing...");
        await this.checkSession();
        this.setupListeners();
        this.renderAuthUI();
    },

    async checkSession() {
        try {
            const response = await fetch('/api/me');
            if (response.status === 401) {
                // Not logged in or session expired
                this.user = null;
                return;
            }
            
            const data = await response.json();
            if (data.authenticated) {
                this.user = data;
                console.log("Auth: User Logged In -", this.user.username);
                // Trigger an event so other components know auth is ready
                document.dispatchEvent(new CustomEvent('auth-ready', { detail: this.user }));
            } else {
                this.user = null;
            }
        } catch (error) {
            console.error("Auth: Session Check Failed", error);
            this.user = null;
        }
    },

    getEffectiveRole() {
        if (!this.user) return 'GUEST';
        
        // 1. SuperAdmin Override
        if (this.user.is_superadmin) return 'SUPERADMIN';

        // 2. Server Specific Role
        const currentServer = this.getServerID();
        const serverRole = this.user.server_perms ? this.user.server_perms[currentServer] : null;
        
        return serverRole || 'USER'; // Default to USER if logged in but no specific role
    },

    renderAuthUI() {
        const authSection = document.getElementById('auth-section');
        const addBtn = document.querySelector('.add-resource-btn'); // The floating button or main action button
        const role = this.getEffectiveRole();

        if (this.user) {
            // Render User Profile
            authSection.innerHTML = `
                <div class="user-profile">
                    <div class="user-info" style="text-align: right;">
                        <div class="username" style="font-family: 'Orbitron'; font-size: 0.8rem;">${this.user.username}</div>
                        <div class="role-badge role-${role.toLowerCase()}" style="font-size: 0.6rem;">${role}</div>
                    </div>
                    <img src="https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.png" class="user-avatar" alt="User">
                    <a href="/logout" class="btn-logout" title="Logout" style="margin-left: 10px; color: var(--text-muted);"><i class="fa-solid fa-right-from-bracket"></i></a>
                </div>`;
            
            // Show/Hide Add Button based on role
            if (addBtn) {
                const power = this.ROLE_POWER[role] || 0;
                // Editors (2) and above can add resources
                addBtn.style.display = power >= 2 ? 'block' : 'none';
            }
        } else {
            // Render Login Button
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
                // Reload page to fetch data for new server
                window.location.reload(); 
            });
        }
    },

    getServerID() {
        const domVal = document.getElementById('server-select')?.value;
        const storedVal = localStorage.getItem('swg_server_id');
        return domVal || storedVal || 'cuemu';
    }
};

document.addEventListener('DOMContentLoaded', () => Auth.init());