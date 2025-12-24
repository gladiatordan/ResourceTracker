function initTaxonomyDropdown() {
    taxonomyMap = {};
    taxonomyData.forEach(item => {
        if (item.parent_id) {
            if (!taxonomyMap[item.parent_id]) taxonomyMap[item.parent_id] = [];
            taxonomyMap[item.parent_id].push(item.id);
        }
    });

    const list = document.getElementById('taxonomy-list');
    list.innerHTML = `<div class="dropdown-item root-item" onclick="selectCategory(1, 'Resources', 'All Resources')">All Resources</div>`;
    
    if (taxonomyMap[1]) buildBranch(1, list);
}

function buildBranch(parentId, container) {
    const children = taxonomyData.filter(item => item.parent_id === parentId);
    children.forEach(child => {
        const itemWrapper = document.createElement('div');
        itemWrapper.className = 'dropdown-item-wrapper';
        
        const hasChildren = taxonomyMap[child.id];
        itemWrapper.innerHTML = `
            <div class="dropdown-item" style="padding-left: ${child.tree_level * 15}px" onclick="selectCategory(${child.id}, '${child.class_label}')">
                ${hasChildren ? '<span class="toggle-icon">▼</span>' : '<span style="width:21px"></span>'}
                <span>${child.class_label}</span>
            </div>
            <div class="branch-container"></div>
        `;
        
        container.appendChild(itemWrapper);
        if (hasChildren) buildBranch(child.id, itemWrapper.querySelector('.branch-container'));
    });
}