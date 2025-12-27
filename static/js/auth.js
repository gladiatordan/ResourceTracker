/**
 * Auth Manager
 * Handles user session state and UI updates for login/logout
 */
const Auth = {
    user: null,

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
                console.log("Logged in as:", this.user.username);
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
            // User is Logged In
            authSection.innerHTML = `
                <div class="user-profile">
                    <img src="https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.png" class="user-avatar" alt="User">
                    <span class="username">${this.user.username}</span>
                    <a href="/logout" class="btn-logout" title="Logout"><i class="fa-solid fa-sign-out-alt"></i></a>
                </div>
            `;
            
            // Show Add Button (Permissions logic can be expanded here)
            if (addBtn) addBtn.style.display = 'block';

        } else {
            // User is Guest
            authSection.innerHTML = `
                <a href="/login" class="btn-discord">
                    <i class="fa-brands fa-discord"></i> Login
                </a>
            `;
            if (addBtn) addBtn.style.display = 'none';
        }
    },

    setupListeners() {
        const serverSelect = document.getElementById('server-select');
        if (serverSelect) {
            // Load saved preference
            const savedServer = localStorage.getItem('swg_server_id');
            if (savedServer) serverSelect.value = savedServer;

            serverSelect.addEventListener('change', (e) => {
                const newServer = e.target.value;
                localStorage.setItem('swg_server_id', newServer);
                // Reload the page or trigger a data refresh
                window.location.reload(); 
            });
        }
    },

    // Helper to get current server context
    getServerID() {
        return document.getElementById('server-select')?.value || 'cuemu';
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
});