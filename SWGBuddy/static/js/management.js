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

		this.filteredUsers.forEach(user => {
			const div = document.createElement('div');
			// Ensure avatar is used as a direct URL
			const avatarSrc = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
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
		const avatarSrc = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;;
		
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
	},

	// --- LOG LOGIC ---
	logState: {
		page: 1,
		limit: 20,
		search: '',
		total: 0
	},

	async loadLogs() {
		const container = document.getElementById('mgmt-view-logs');
		// Setup UI structure once
		if (!document.getElementById('log-table-container')) {
			this.setupLogUI(container);
		}
		
		await this.fetchLogs();
	},

	setupLogUI(container) {
		container.innerHTML = `
			<div class="mgmt-search-container" style="margin-bottom:10px;">
				<input type="text" id="log-search" class="mgmt-search-input" placeholder="Search logs (User, Command, Resource)...">
				<button class="mgmt-refresh-btn" onclick="Management.fetchLogs(1)"><i class="fa-solid fa-search"></i></button>
			</div>
			<div id="log-table-container" class="log-table-wrapper"></div>
			<div id="log-pagination" class="pagination-controls" style="justify-content:center; margin-top:10px;"></div>
		`;
		
		document.getElementById('log-search').addEventListener('change', (e) => {
			this.logState.search = e.target.value;
			this.fetchLogs(1);
		});
	},

	async fetchLogs(pageOverride) {
		if (pageOverride) this.logState.page = pageOverride;
		
		const tableContainer = document.getElementById('log-table-container');
		tableContainer.innerHTML = '<div style="padding:20px; text-align:center;">Loading logs...</div>';
		
		try {
			const data = await API.fetchCommandLog(
				this.currentServer, 
				this.logState.page, 
				this.logState.limit, 
				this.logState.search
			);
			
			this.logState.total = data.total;
			this.renderLogTable(data.logs);
			this.renderLogPagination(data.pages);
			
		} catch (error) {
			tableContainer.innerHTML = `<div style="color:red">Error: ${error.message}</div>`;
		}
	},

	renderLogTable(logs) {
		const container = document.getElementById('log-table-container');
		if (!logs || logs.length === 0) {
			container.innerHTML = '<div style="padding:20px; text-align:center;">No records found.</div>';
			return;
		}

		let html = `
			<table class="log-table">
				<thead>
					<tr>
						<th width="180">Date</th>
						<th>User</th>
						<th width="150">Command</th>
						<th>Details Preview</th>
						<th width="50"></th>
					</tr>
				</thead>
				<tbody>
		`;

		logs.forEach(log => {
			const date = new Date(log.timestamp * 1000).toLocaleString();
			// Basic preview of details (e.g., Resource Name or ID)
			let preview = '';
			if (log.details.name) preview = `Resource: ${log.details.name}`;
			else if (log.details.target_user_id) preview = `Target: ${log.details.target_user_id}`;
			else preview = JSON.stringify(log.details).substring(0, 50) + '...';

			html += `
				<tr class="log-row" onclick="Management.toggleLogDetail(${log.id})">
					<td class="log-date">${date}</td>
					<td class="log-user">
						<div style="display:flex; align-items:center; gap:8px;">
							<img src="${this.getAvatarUrl(log)}" class="mgmt-avatar-small" style="width:24px; height:24px;">
							<span>${log.username}</span>
						</div>
					</td>
					<td class="log-cmd"><span class="cmd-badge">${log.command}</span></td>
					<td class="log-preview">${preview}</td>
					<td style="text-align:center;"><i id="icon-${log.id}" class="fa-solid fa-chevron-down"></i></td>
				</tr>
				<tr id="detail-${log.id}" class="log-detail-row hidden">
					<td colspan="5">
						<div class="log-json-viewer">
							<pre>${JSON.stringify(log.details, null, 2)}</pre>
						</div>
					</td>
				</tr>
			`;
		});

		html += '</tbody></table>';
		container.innerHTML = html;
	},

	toggleLogDetail(id) {
		const row = document.getElementById(`detail-${id}`);
		const icon = document.getElementById(`icon-${id}`);
		if (row.classList.contains('hidden')) {
			row.classList.remove('hidden');
			icon.className = 'fa-solid fa-chevron-up';
		} else {
			row.classList.add('hidden');
			icon.className = 'fa-solid fa-chevron-down';
		}
	},

	renderLogPagination(totalPages) {
		const container = document.getElementById('log-pagination');
		let html = '';
		if (totalPages > 1) {
			html += `<button class="page-nav-btn" onclick="Management.fetchLogs(${Math.max(1, this.logState.page - 1)})">‹</button>`;
			html += `<span style="padding:0 10px;">Page ${this.logState.page} of ${totalPages}</span>`;
			html += `<button class="page-nav-btn" onclick="Management.fetchLogs(${Math.min(totalPages, this.logState.page + 1)})">›</button>`;
		}
		container.innerHTML = html;
	},

	getAvatarUrl(u) {
		return u.avatar_url 
			? `https://cdn.discordapp.com/avatars/${u.user_id}/${u.avatar_url}.png`
			: '/static/img/default-avatar.png';
	},

	// ... (Updated switchTab to call loadLogs) ...
	switchTab(tabName) {
		this.currentTab = tabName;
		// ... (class toggling) ...
		
		if (tabName === 'logs') {
			this.loadLogs();
		}
	},
};

window.openServerManagement = () => Management.open();
window.closeManagementModal = () => Management.close();

document.addEventListener('DOMContentLoaded', () => Management.init());