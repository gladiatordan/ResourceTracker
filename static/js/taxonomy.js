/**
 * Taxonomy Component
 * Handles recursive tree building for category dropdowns
 */

// Shared utility to build the taxonomy map
function buildTaxonomyMap(data) {
    const map = {};
    data.forEach(item => {
        // Use 0 as a virtual root if parent_id is null or missing
        const pid = item.parent_id || 0;
        if (!map[pid]) map[pid] = [];
        map[pid].push(item.id);
    });
    return map;
}

/**
 * Core recursive function to build dropdown branches
 * @param {number} parentId - The ID to search children for
 * @param {HTMLElement} container - Where to attach the items
 * @param {Function} onSelect - Callback when a category is clicked
 */
function buildBranch(parentId, container, onSelect) {
    const children = taxonomyData.filter(item => (item.parent_id || 0) === parentId);
    
    children.forEach(child => {
        const hasChildren = taxonomyMap[child.id] && taxonomyMap[child.id].length > 0;
        
        const itemWrapper = document.createElement('div');
        itemWrapper.className = 'dropdown-item-wrapper';
        
        const row = document.createElement('div');
        row.className = 'dropdown-item';
        row.style.paddingLeft = `${child.tree_level * 15}px`;
        
        // Add Toggle Icon or Spacer
        if (hasChildren) {
            const icon = document.createElement('span');
            icon.className = 'toggle-icon';
            icon.innerHTML = '▼';
            icon.onclick = (e) => {
                e.stopPropagation();
                const subBranch = itemWrapper.querySelector('.branch-container');
                subBranch.classList.toggle('hidden');
                icon.classList.toggle('collapsed');
            };
            row.appendChild(icon);
        } else {
            const spacer = document.createElement('span');
            spacer.style.width = '21px'; 
            row.appendChild(spacer);
        }

        // Category Label
        const label = document.createElement('span');
        label.textContent = child.class_label;
        label.style.cursor = 'pointer';
        label.style.flexGrow = '1';
        label.onclick = () => onSelect(child.id, child.class_label);
        
        row.appendChild(label);
        itemWrapper.appendChild(row);

        // Recursive Sub-branch
        if (hasChildren) {
            const subBranch = document.createElement('div');
            subBranch.className = 'branch-container hidden';
            buildBranch(child.id, subBranch, onSelect);
            itemWrapper.appendChild(subBranch);
        }

        container.appendChild(itemWrapper);
    });
}

/**
 * Initializes the main resource log filter dropdown
 */
function initTaxonomyDropdown() {
    taxonomyMap = buildTaxonomyMap(taxonomyData);
    const listContainer = document.getElementById('taxonomy-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    // Create "All Resources" Root
    const rootItem = document.createElement('div');
    rootItem.className = 'dropdown-item root-item';
    
    const rootLabel = document.createElement('span');
    rootLabel.textContent = "All Resources";
    rootLabel.style.cursor = 'pointer';
    rootLabel.style.width = '100%';
    rootItem.appendChild(rootLabel);

    rootItem.onclick = () => selectCategory(1, "Resources", "All Resources"); 
    listContainer.appendChild(rootItem);

    // Build branches starting from 0 (items previously under removed "Resources" root)
    buildBranch(0, listContainer, selectCategory);
}

/**
 * Initializes the dropdown inside the Resource Details Modal
 */
function initModalTaxonomy() {
    const listContainer = document.getElementById('modal-taxonomy-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    const onModalSelect = (id, label) => {
        const display = document.querySelector('#modal-taxonomy-dropdown .dropdown-selected');
        const hiddenInput = document.getElementById('modal-type-value');
        
        if (display) display.textContent = label;
        if (hiddenInput) {
            hiddenInput.value = label;
            onModalInputChange(); // Trigger "Save" button state
        }
        toggleModalDropdown();
    };

    buildBranch(0, listContainer, onModalSelect);
}