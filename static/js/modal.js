/**
 * Modal Component
 * Handles viewing and editing resource details
 */

function openResourceModal(resourceName) {
    const res = rawResourceData.find(r => r.name === resourceName);
    if (!res) return;

    // Highlight the row when the link is clicked
    const rowId = `row-${resourceName.replace(/['\s]/g, '-')}`;
    const row = document.getElementById(rowId);
    highlightRow(row);

    // Update the modal title with the resource name
    document.getElementById('modal-title').textContent = `Details - ${resourceName}`;

    originalModalData = { ...res }; // Store original data for cancellation
    renderModalContent(res);
    resetModalUI();

    document.getElementById('resource-modal').style.display = 'flex';
}

function resetModalUI() {
    document.getElementById('modal-status-bar').textContent = '';
    document.getElementById('btn-edit').disabled = false;
    document.getElementById('btn-save').disabled = true;
    document.getElementById('btn-cancel').disabled = true;
}

function enterEditMode() {
    document.getElementById('modal-status-bar').textContent = '';
    renderModalContent(originalModalData, true);
    document.getElementById('btn-edit').disabled = true;
    document.getElementById('btn-cancel').disabled = false;
}

function cancelEditMode() {
    document.getElementById('modal-status-bar').textContent = '';
    renderModalContent(originalModalData, false);
    resetModalUI();
}

function onModalInputChange() {
    document.getElementById('modal-status-bar').textContent = '';
    document.getElementById('btn-save').disabled = false;
}

function renderModalContent(data, isEditable = false) {
    const body = document.getElementById('modal-body');
    const numericKeys = ['res_rating', 'res_oq', 'res_cr', 'res_cd', 'res_dr', 'res_fl', 'res_hr', 'res_ma', 'res_pe', 'res_sr', 'res_ut'];
    
    let typeDisplay;
    if (isEditable) {
        typeDisplay = `
            <div class="custom-dropdown modal-dropdown" id="modal-taxonomy-dropdown">
                <div class="dropdown-selected" onclick="toggleModalDropdown()">${data.type}</div>
                <div class="dropdown-list" id="modal-taxonomy-list" style="display: none;"></div>
                <input type="hidden" id="modal-type-value" data-key="type" value="${data.type}">
            </div>`;
    } else {
        typeDisplay = data.type;
    }

    const fields = [
        { label: 'Type', key: 'type', val: typeDisplay, isCustom: true },
        { label: 'Rating', key: 'res_rating', val: data.res_rating },
        { label: 'Overall Quality', key: 'res_oq', val: data.res_oq },
        { label: 'Cold Resistance', key: 'res_cr', val: data.res_cr },
        { label: 'Conductivity', key: 'res_cd', val: data.res_cd },
        { label: 'Decay Resistance', key: 'res_dr', val: data.res_dr },
        { label: 'Flavor', key: 'res_fl', val: data.res_fl },
        { label: 'Heat Resistance', key: 'res_hr', val: data.res_hr },
        { label: 'Malleability', key: 'res_ma', val: data.res_ma },
        { label: 'Potential Energy', key: 'res_pe', val: data.res_pe },
        { label: 'Shock Resistance', key: 'res_sr', val: data.res_sr }, 
        { label: 'Unit Toughness', key: 'res_ut', val: data.res_ut },
        { label: 'Date Reported', key: 'date_reported', val: formatDate(data.date_reported), skipEdit: true },
        { label: 'Status', key: 'is_active', val: data.is_active ? 'Active' : 'Inactive', skipEdit: true },
        { label: 'Notes', key: 'notes', val: data.notes, isTextArea: true }
    ];

    body.innerHTML = fields.map(f => {
        let valueHTML;
        if (f.isCustom) {
            valueHTML = f.val;
        } else if (isEditable && !f.skipEdit) {
            if (f.isTextArea) {
                const textareaVal = String(f.val || '').replace(/,/g, '\n');
                valueHTML = `<textarea oninput="onModalInputChange()" data-key="${f.key}" class="modal-textarea">${textareaVal}</textarea>`;
            } else {
                const isNumeric = numericKeys.includes(f.key);
                valueHTML = `<input type="${isNumeric ? 'number' : 'text'}" step="1" value="${f.val !== null && f.val !== undefined ? f.val : ''}" oninput="onModalInputChange()" data-key="${f.key}">`;
            }
        } else {
            if (f.key === 'notes') {
                const displayStr = String(f.val || '').replace(/,/g, '\n');
                valueHTML = displayStr ? displayStr.replace(/\n/g, '<br>') : '-';
            } else {
                valueHTML = f.val !== null && f.val !== undefined ? f.val : '-';
            }
        }
        return `<div class="modal-label">${f.label}</div><div class="modal-value">${valueHTML}</div>`;
    }).join('');

    if (isEditable) initModalTaxonomy();
}

async function saveResourceEdits() {
    const inputs = document.querySelectorAll('.modal-value input, .modal-value textarea, #modal-type-value');
    const updatedData = { ...originalModalData };
    const statusBox = document.getElementById('modal-status-bar');
    
    let isValid = true;
    inputs.forEach(input => {
        const key = input.getAttribute('data-key');
        let val = input.value;

        if (key === 'notes') {
            val = val.replace(/\n/g, ',');
        } else if (input.type === 'number') {
            const numVal = Number(val);
            if (val === '' || !Number.isInteger(numVal) || numVal < 0 || numVal > 1000) {
                isValid = false;
                input.style.borderColor = "#ef4444";
            } else {
                input.style.borderColor = "var(--border-color)";
                val = parseInt(val, 10);
            }
        }
        updatedData[key] = val;
    });

    if (!isValid) {
        statusBox.textContent = "Validation Error: Stats must be 0-1000";
        statusBox.className = "status-bar status-error";
        return;
    }

    try {
        const response = await fetch('/api/update-resource', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });

        if (response.ok) {
            statusBox.textContent = "Update Successful";
            statusBox.className = "status-bar status-success";
            
            const idx = rawResourceData.findIndex(r => r.name === updatedData.name);
            if (idx !== -1) rawResourceData[idx] = updatedData;
            
            originalModalData = { ...updatedData };
            renderModalContent(updatedData, false);
            resetModalUI();
            applyAllTableTransforms(); 
        } else {
            throw new Error("Server rejected update");
        }
    } catch (e) {
        statusBox.textContent = "Update Failed: Server Error";
        statusBox.className = "status-bar status-error";
    }
}

function closeModal(event = null) {
    document.getElementById('resource-modal').style.display = 'none';
}

function toggleModalDropdown() {
    const list = document.getElementById('modal-taxonomy-list');
    list.style.display = list.style.display === 'block' ? 'none' : 'block';
}