/**
 * Server Management Controller
 */
const Management = {
    currentServer: null,
    currentTab: 'permissions',
    users: [],
    selectedUser: null,

    elements: {
        modal: document.getElementById('management-modal'),
        serverSelect: document.getElementById('mgmt-server-select'),
        userList: document.getElementById('mgmt-user-list'),
        userDetail: document.getElementById('mgmt-user-detail'),
        loader: document.getElementById('mgmt-loader'), // Reuse modal loader logic if desired
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
    },

    open() {
        if (!window.Auth || !Auth.hasPermission('EDITOR')) return;

        // Populate Server Select based on permissions
        const perms = Auth.user.server_perms || {};
        const select = this.elements.serverSelect;
        select.innerHTML = '';
        
        // If SuperAdmin, maybe list all? For now, list keys in perms + cuemu
        // Or just use the current page context server as default
        const currentContext = API.getServerContext();
        
        // Add current if we have rights
        if (Auth.hasPermission('EDITOR')) {
            const opt = document.createElement('option');
            opt.value = currentContext;
            opt.textContent = currentContext.toUpperCase(); // Placeholder label
            select.appendChild(opt);
        }
        
        // Show Modal
        this.elements.modal.classList.remove('hidden');
        this.loadServerData(currentContext);
    },

    close() {
        this.elements.modal.classList.add('hidden');
    },

    switchTab(tabName) {
        this.currentTab = tabName;
        
        // Toggle Active Button
        document.querySelectorAll('.mgmt-nav-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tabName);
        });

        // Toggle Views
        document.getElementById('mgmt-view-permissions').classList.toggle('active', tabName === 'permissions');
        document.getElementById('mgmt-view-logs').classList.toggle('active', tabName === 'logs');
    },

    async loadServerData(serverId) {
        this.currentServer = serverId;
        // Show loader...
        
        if (this.currentTab === 'permissions') {
            await this.fetchUsers();
        } else {
            // Logs...
        }
    },

    async fetchUsers() {
        try {
            this.elements.userList.innerHTML = '<div style="padding:10px">Loading...</div>';
            this.elements.userDetail.innerHTML = '<div style="opacity:0.5">Select a user to edit</div>';
            
            const data = await API.fetchManagedUsers(this.currentServer);
            this.users = data.users || [];
            this.renderUserList();
        } catch (error) {
            this.elements.userList.innerHTML = `<div style="color:red">Error: ${error.message}</div>`;
        }
    },

    renderUserList() {
        const list = this.elements.userList;
        list.innerHTML = '';
        
        if (this.users.length === 0) {
            list.innerHTML = '<div style="padding:10px">No manageable users found.</div>';
            return;
        }

        this.users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'mgmt-user-item';
            div.innerHTML = `
                <img src="${user.avatar}" class="mgmt-avatar-small">
                <div>
                    <div style="font-weight:bold">${user.username}</div>
                    <div class="mgmt-user-role">${user.role}</div>
                </div>
            `;
            div.onclick = () => this.selectUser(user, div);
            list.appendChild(div);
        });
    },

    selectUser(user, domElement) {
        this.selectedUser = user;
        
        // Highlight logic
        document.querySelectorAll('.mgmt-user-item').forEach(el => el.classList.remove('selected'));
        domElement.classList.add('selected');

        // Render Detail
        this.renderUserDetail(user);
    },

    renderUserDetail(user) {
        // Determine available roles (lower than mine)
        const myRole = Auth.getCurrentRole();
        const hierarchy = ['GUEST', 'USER', 'EDITOR', 'ADMIN', 'SUPERADMIN'];
        const myLevel = hierarchy.indexOf(myRole);
        
        let options = '';
        hierarchy.forEach((role, idx) => {
            if (idx < myLevel && idx > 0) { // Can assign any role LOWER than self (and not Guest/Super usually?)
                // Actually prompt says "only show roles lower than current role"
                const selected = (role === user.role) ? 'selected' : '';
                options += `<option value="${role}" ${selected}>${role}</option>`;
            }
        });

        this.elements.userDetail.innerHTML = `
            <img src="${user.avatar}" class="mgmt-avatar-large">
            <div class="mgmt-username-large">${user.username}</div>
            
            <div class="role-select-container">
                <label style="color:var(--text-dim); font-size:0.8rem;">SET ROLE</label>
                <select id="mgmt-role-select" class="planet-select" style="width:100%; margin-top:5px;">
                    ${options}
                </select>
                <button class="btn-primary" style="width:100%; margin-top:15px;" onclick="Management.saveRole()">Update Role</button>
            </div>
        `;
    },

    async saveRole() {
        if (!this.selectedUser) return;
        const newRole = document.getElementById('mgmt-role-select').value;
        
        try {
            await API.setRole(this.selectedUser.id, newRole);
            alert(`Updated ${this.selectedUser.username} to ${newRole}`);
            this.fetchUsers(); // Refresh list
        } catch (error) {
            alert("Error: " + error.message);
        }
    }
};

window.openServerManagement = () => Management.open();
window.closeManagementModal = () => Management.close();

document.addEventListener('DOMContentLoaded', () => Management.init());