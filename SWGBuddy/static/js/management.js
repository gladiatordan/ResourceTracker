/**
 * Server Management Controller
 */
const Management = {
    currentServer: null,
    currentTab: 'permissions',
    users: [],
    filteredUsers: [],
    selectedUser: null,

    elements: {
        modal: document.getElementById('management-modal'),
        serverSelect: document.getElementById('mgmt-server-select'),
        userListPane: document.getElementById('mgmt-user-list'), // Container
        userDetail: document.getElementById('mgmt-user-detail'),
        // Dynamic elements
        userListScroll: null,
        searchInput: null,
    },

    init() {
        // Tab Switching
        document.querySelectorAll('.mgmt-nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Server Change
        if(this.elements.serverSelect) {
            this.elements.serverSelect.addEventListener('change', (e) => {
                this.loadServerData(e.target.value);
            });
        }

        // Inject Structure into User List Pane once
        this.setupUserPane();
    },

    setupUserPane() {
        const pane = this.elements.userListPane;
        pane.innerHTML = ''; // Clear "Loading..."

        // 1. Search Header
        const header = document.createElement('div');
        header.className = 'mgmt-search-container';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'mgmt-search-input';
        input.placeholder = 'Filter users...';
        input.addEventListener('input', (e) => this.filterUsers(e.target.value));
        this.elements.searchInput = input;

        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'mgmt-refresh-btn';
        refreshBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
        refreshBtn.title = "Refresh User List";
        refreshBtn.onclick = () => this.fetchUsers();

        header.appendChild(input);
        header.appendChild(refreshBtn);
        pane.appendChild(header);

        // 2. Scrollable List Area
        const scrollArea = document.createElement('div');
        scrollArea.className = 'user-list-scroll-area';
        this.elements.userListScroll = scrollArea;
        pane.appendChild(scrollArea);
    },

    open() {
        if (!window.Auth || !Auth.hasPermission('EDITOR')) return;

        const currentContext = API.getServerContext();
        
        // Populate Server Select
        const select = this.elements.serverSelect;
        select.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = currentContext;
        opt.textContent = currentContext.toUpperCase();
        select.appendChild(opt);
        
        this.elements.modal.classList.remove('hidden');
        this.loadServerData(currentContext);
    },

    close() {
        this.elements.modal.classList.add('hidden');
    },

    switchTab(tabName) {
        this.currentTab = tabName;
        document.querySelectorAll('.mgmt-nav-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tabName);
        });
        document.getElementById('mgmt-view-permissions').classList.toggle('active', tabName === 'permissions');
        document.getElementById('mgmt-view-logs').classList.toggle('active', tabName === 'logs');
    },

    async loadServerData(serverId) {
        this.currentServer = serverId;
        if (this.currentTab === 'permissions') {
            await this.fetchUsers();
        }
    },

    async fetchUsers() {
        const listArea = this.elements.userListScroll;
        try {
            listArea.innerHTML = '<div style="padding:10px; color:#888;">Loading users...</div>';
            this.elements.userDetail.innerHTML = '<div style="opacity:0.5; margin-top:20px;">Select a user to edit</div>';
            
            const data = await API.fetchManagedUsers(this.currentServer);
            this.users = data.users || [];
            this.filteredUsers = [...this.users]; // Reset filter
            
            // Clear search box if refreshing
            if(this.elements.searchInput) this.elements.searchInput.value = '';

            this.renderUserList();
        } catch (error) {
            listArea.innerHTML = `<div style="color:red; padding:10px;">Error: ${error.message}</div>`;
        }
    },

    filterUsers(query) {
        const term = query.toLowerCase();
        this.filteredUsers = this.users.filter(u => u.username.toLowerCase().includes(term));
        this.renderUserList();
    },

    renderUserList() {
        const list = this.elements.userListScroll;
        list.innerHTML = '';
        
        if (this.filteredUsers.length === 0) {
            list.innerHTML = '<div style="padding:10px">No users found.</div>';
            return;
        }

		// Ensure avatar is used as a direct URL
        const avatarSrc = user.avatar || '/static/img/default-avatar.png';

        this.filteredUsers.forEach(user => {
            const div = document.createElement('div');
            div.className = 'mgmt-user-item';
            div.innerHTML = `
                <img src="${avatarSrc}" class="mgmt-avatar-small">
                <div>
                    <div style="font-weight:bold; color:var(--text-main);">${user.username}</div>
                    <div class="mgmt-user-role">${user.role}</div>
                </div>
            `;
            div.onclick = () => this.selectUser(user, div);
            list.appendChild(div);
        });
    },

    selectUser(user, domElement) {
        this.selectedUser = user;
        
        document.querySelectorAll('.mgmt-user-item').forEach(el => el.classList.remove('selected'));
        domElement.classList.add('selected');

        this.renderUserDetail(user);
    },

    renderUserDetail(user) {
        const myRole = Auth.getCurrentRole();
        const hierarchy = ['GUEST', 'USER', 'EDITOR', 'ADMIN', 'SUPERADMIN'];
        const myLevel = hierarchy.indexOf(myRole);

		// Ensure avatar is used as a direct URL
    	const avatarSrc = user.avatar || '/static/img/default-avatar.png';
        
        let options = '';
        hierarchy.forEach((role, idx) => {
            if (idx < myLevel && idx > 0) { 
                const selected = (role === user.role) ? 'selected' : '';
                options += `<option value="${role}" ${selected}>${role}</option>`;
            }
        });

        this.elements.userDetail.innerHTML = `
            <img src="${avatarSrc}" class="mgmt-avatar-large">
            <div class="mgmt-username-large">${user.username}</div>
            
            <div class="role-select-container">
                <label style="color:var(--text-dim); font-size:0.8rem; margin-bottom:5px; display:block;">SET ROLE</label>
                <select id="mgmt-role-select" style="width:100%;">
                    ${options}
                </select>
                <button class="btn-primary" style="width:100%; margin-top:20px;" onclick="Management.saveRole()">Update Role</button>
            </div>
        `;
    },

    async saveRole() {
        if (!this.selectedUser) return;
        const newRole = document.getElementById('mgmt-role-select').value;
        
        try {
            await API.setRole(this.selectedUser.id, newRole);
            alert(`Updated ${this.selectedUser.username} to ${newRole}`);
            this.fetchUsers(); // Refresh list to update UI
        } catch (error) {
            alert("Error: " + error.message);
        }
    }
};

window.openServerManagement = () => Management.open();
window.closeManagementModal = () => Management.close();

document.addEventListener('DOMContentLoaded', () => Management.init());