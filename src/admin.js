import { showToast } from './toast.js';
import { sanitize } from "./utils.js";
import { OrderStatus } from "./constants.js";
import { polyfill } from "mobile-drag-drop";
import "mobile-drag-drop/default.css";

let isAuthRedirecting = false;

async function apiFetch(url, options = {}) {
    const fetchOptions = {
        ...options,
        redirect: 'manual'
    };

    const response = await fetch(url, fetchOptions);

    if (response.type === 'opaqueredirect' || response.status === 401) {
        if (!isAuthRedirecting) {
            isAuthRedirecting = true;

            showToast('Platnost relace vypršela', 'Budete přesměrováni na přihlašovací stránku.', 'error');

            setTimeout(() => {
                window.location.href = '/admin';
            }, 1000);
        }

        throw new Error('Session expired (Intercepted by Cloudflare)');
    }

    return response;
}

polyfill({
    holdToDrag: 0
});

window.addEventListener('touchmove', function() {}, {passive: false});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('current-year').textContent = new Date().getFullYear().toString();

    initTabs();
    initModals();

    // Order search input
    const searchInput = document.getElementById('search-orders');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            renderOrders();
        });
    }

    loadOrders();
    loadProducts();
    loadAudit();

    document.getElementById('btn-add-new').addEventListener('click', () => openProductForm());
    document.getElementById('btn-cancel-edit').addEventListener('click', closeProductForm);
    document.getElementById('product-form').addEventListener('submit', handleProductSave);
    document.getElementById('btn-delete-product').addEventListener('click', handleProductDelete);

    document.getElementById('btn-save-order').addEventListener('click', saveNewOrder);
    document.getElementById('btn-revert-order').addEventListener('click', () => {
        document.getElementById('order-action-bar').style.display = 'none';
        loadProducts();
    });
});

function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });
}

// ============================================
// ORDERS
// ============================================
const STATUS_CONFIG = {
    [OrderStatus.PENDING]: { text: 'NOVÁ', className: 'badge-new' },
    [OrderStatus.READY]: { text: 'PŘIPRAVENA', className: 'badge-ready' },
    [OrderStatus.COMPLETED]: { text: 'VYZVEDNUTO', className: 'badge-done' },
    [OrderStatus.CANCELED]: { text: 'STORNOVANÁ', className: 'badge-cancel' },
    [OrderStatus.CANCELED_BY_USER]: { text: 'STORNOVANÁ ZÁKAZNÍKEM', className: 'badge-cancel' },
    [OrderStatus.CANCELED_UNCOLLECTED]: { text: 'STORNOVANÁ (NEVYZVEDNUTO)', className: 'badge-cancel' },
};

let currentOrders = [];
let sortConfig = { column: 'status_updated_at', direction: 'desc' };
let searchQuery = '';

async function loadOrders() {
    const container = document.getElementById('orders-list-container');
    try {
        const res = await apiFetch('/admin/api/orders');
        if (!res.ok) throw new Error('Nepodařilo se načíst rezervace.');
        currentOrders = await res.json();
        renderOrders();
    } catch (e) {
        if (e.message !== 'Session expired') {
            container.innerHTML = `<p class="error-msg">Chyba při načítání: ${e.message}</p>`;
        }
    }
}

window.sortOrders = (column) => {
    if (sortConfig.column === column) {
        sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortConfig.column = column;
        sortConfig.direction = 'desc';
    }

    currentOrders.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
    renderOrders();
};

function renderOrders() {
    const container = document.getElementById('orders-list-container');

    const filteredOrders = currentOrders.filter(o => {
        const term = searchQuery;
        if (!term) return true;
        return o.id.toString().includes(term) ||
            o.customer_name.toLowerCase().includes(term) ||
            o.customer_email.toLowerCase().includes(term);
    });

    if (filteredOrders.length === 0) {
        container.innerHTML = '<p style="color: rgba(255,255,255,0.5);">Žádné rezervace neodpovídají hledání.</p>';
        return;
    }

    const getArrow = (col) => sortConfig.column === col ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : '';

    let html = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th class="sortable" onclick="sortOrders('id')">ID${getArrow('id')}</th>
                    <th class="sortable" onclick="sortOrders('customer_name')">Zákazník${getArrow('customer_name')}</th>
                    <th class="sortable" onclick="sortOrders('status')">Stav${getArrow('status')}</th>
                    <th class="sortable" onclick="sortOrders('status_updated_at')">Aktualizováno${getArrow('status_updated_at')}</th>
                    <th>Akce</th>
                </tr>
            </thead>
            <tbody>
    `;

    filteredOrders.forEach(o => {
        const date = new Date(o.status_updated_at.replace(' ', 'T') + 'Z').toLocaleString('cs-CZ');

        const statusInfo = STATUS_CONFIG[o.status] || { text: o.status, className: 'badge-new' };
        const czStatus = statusInfo.text;
        const badgeClass = statusInfo.className;

        html += `
            <tr>
                <td>#${o.id}</td>
                <td><strong>${sanitize(o.customer_name)}</strong><br><small>${sanitize(o.customer_email)}</small></td>
                <td><span class="status-badge ${badgeClass}">${czStatus}</span></td>
                <td>${date}</td>
                <td><button class="btn-action-primary btn-sm" onclick="openOrderModal(${o.id})">Detail</button></td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

window.openOrderModal = async (id) => {
    const order = currentOrders.find(o => o.id === id);
    if (!order) return;

    const dbStatus = (order.status || 'PENDING').toUpperCase();

    document.getElementById('order-modal').style.display = 'flex';
    document.getElementById('modal-order-title').textContent = `Rezervace #${order.id}`;
    const body = document.getElementById('modal-order-body');
    const actions = document.getElementById('modal-order-actions');

    body.innerHTML = '<div class="loader">Načítám položky...</div>';
    actions.innerHTML = '';

    try {
        const res = await apiFetch(`/admin/api/orders/${id}/items`);
        if (!res.ok) throw new Error(`HTTP chyba: ${res.status}`);
        const items = await res.json();

        // Customer info header
        let html = `
            <div class="modal-customer-info">
                <div class="info-row"><span>Zákazník:</span> <strong>${sanitize(order.customer_name)}</strong></div>
                <div class="info-row"><span>E-mail:</span> <a href="mailto:${sanitize(order.customer_email)}">${sanitize(order.customer_email)}</a></div>
                <div class="info-row"><span>Telefon:</span> <a href="tel:${sanitize(order.customer_phone)}">${sanitize(order.customer_phone)}</a></div>
            </div>
        `;

        // Order info
        if (items.length === 0) {
            html += '<p>Tato rezervace je prázdná.</p>';
        } else {
            html += '<div class="modal-items-wrapper"><ul class="order-items-list">';
            let total = 0;
            items.forEach(i => {
                const itemTotal = i.quantity * i.price;
                total += itemTotal;
                html += `
                    <li>
                        <div class="item-main">
                            <span class="item-qty">${i.quantity}x</span>
                            <span class="item-name">${sanitize(i.product_name)} ${i.size ? `<span style="display:block; font-size: 0.85rem; color: rgba(255,255,255,0.5); margin-top: 0.2rem;">Velikost: ${sanitize(i.size)}</span>` : ''}</span>
                        </div>
                        <div class="item-price">${itemTotal} Kč</div>
                    </li>
                `;
            });
            html += `</ul></div><div class="order-total">Celkem k platbě: <strong>${total} Kč</strong></div>`;
        }
        body.innerHTML = html;

        // State change buttons
        let actionButtons = '';

        if (dbStatus === OrderStatus.PENDING) {
            actionButtons += `<button class="btn-action-primary modal-btn" onclick="changeOrderStatus(${id}, '${OrderStatus.READY}')" style="background-color: #3498db; color: white;">Označit jako připravené</button>`;
            actionButtons += `<button class="btn-action-danger modal-btn" onclick="changeOrderStatus(${id}, '${OrderStatus.CANCELED}')">Stornovat</button>`;
        }
        else if (dbStatus === OrderStatus.READY) {
            actionButtons += `<button class="btn-action-success modal-btn" onclick="changeOrderStatus(${id}, '${OrderStatus.COMPLETED}')">Vyzvednuto</button>`;
            actionButtons += `<button class="btn-action-secondary modal-btn" onclick="changeOrderStatus(${id}, '${OrderStatus.PENDING}')">Zpět na "Nová"</button>`;
            actionButtons += `<button class="btn-action-danger modal-btn" onclick="changeOrderStatus(${id}, '${OrderStatus.CANCELED}')">Stornovat</button>`;
        }
        else if (dbStatus === OrderStatus.COMPLETED || dbStatus === OrderStatus.CANCELED) {
            actionButtons += `<button class="btn-action-secondary modal-btn" onclick="changeOrderStatus(${id}, '${OrderStatus.PENDING}')">Vrátit zpět na "Nová"</button>`;
        }

        actions.innerHTML = actionButtons;
    } catch (e) {
        if (e.message !== 'Session expired') {
            body.innerHTML = `<p class="error-msg">Chyba při stahování detailů: ${e.message}</p>`;
        }
    }
}

window.changeOrderStatus = async (id, status) => {
    if (status === 'CANCELED') {
        const confirmed = await customConfirm(
            'Stornovat rezervaci?',
            'Opravdu chceš stornovat tuto rezervaci?\n\nZákazník bude automaticky informován e-mailem.',
            'Ano, stornovat',
            'btn-action-danger'
        );
        if (!confirmed) return;
    }

    if (status === 'READY') {
        const confirmed = await customConfirm(
            'Označit jako připravené?',
            'Opravdu chceš rezervaci označit jako připravenou k vyzvednutí?\n\nZákazníkovi se automaticky odešle informační e-mail a začne běžet lhůta 7 dní na vyzvednutí.',
            'Ano, je připravena',
            'btn-action-success'
        );
        if (!confirmed) return;
    }

    try {
        const response = await apiFetch(`/admin/api/orders/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });

        // Check if the API returned an error
        if (!response.ok) {
            const errorData = await response.json();
            // Throw an error with the message from the backend
            throw new Error(errorData.error || `HTTP chyba: ${response.status}`);
        }

        // If successful, close the modal and refresh data
        document.getElementById('order-modal').style.display = 'none';
        await loadOrders();
        await loadAudit();
        showToast('Stav změněn', `Stav rezervace #${id} byl úspěšně aktualizován.`, 'success');

    } catch (e) {
        if (e.message !== 'Session expired') {
            // Display the error message from the backend in a toast
            showToast('Změna se nezdařila', e.message, 'error');

            // Also refresh the data to show the admin the *actual* current state
            document.getElementById('order-modal').style.display = 'none';
            await loadOrders();
        }
    }
}

function initModals() {
    const orderModal = document.getElementById('order-modal');

    document.getElementById('btn-close-modal').addEventListener('click', () => {
        orderModal.style.display = 'none';
    });

    orderModal.addEventListener('click', (e) => {
        if (e.target === orderModal) {
            orderModal.style.display = 'none';
        }
    });
}

// Custom confirmation modal
function customConfirm(title, message, okText = 'Potvrdit', okClass = 'btn-action-danger') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-modal-title');
        const textEl = document.getElementById('confirm-modal-text');
        const btnOk = document.getElementById('btn-confirm-ok');
        const btnCancel = document.getElementById('btn-confirm-cancel');
        const btnClose = document.getElementById('btn-close-confirm');

        titleEl.textContent = title;
        textEl.textContent = message;
        btnOk.textContent = okText;

        btnOk.className = `modal-btn ${okClass}`;

        modal.style.display = 'flex';

        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        const onOutsideClick = (e) => {
            if (e.target === modal) {
                onCancel();
            }
        };

        const cleanup = () => {
            modal.style.display = 'none';
            btnOk.removeEventListener('click', onOk);
            btnCancel.removeEventListener('click', onCancel);
            btnClose.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onOutsideClick);
        };

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
        btnClose.addEventListener('click', onCancel);
        modal.addEventListener('click', onOutsideClick);
    });
}

// ============================================
// PRODUCTS & AUDIT LOG
// ============================================
let currentProducts = [];

async function loadProducts() {
    const container = document.getElementById('admin-products-list');
    const placeholderSvg = '/src/assets/camera.svg';

    try {
        const res = await apiFetch('/api/products');
        currentProducts = await res.json();

        if (currentProducts.length === 0) {
            container.innerHTML = '<p style="color: rgba(255,255,255,0.5);">Katalog je zatím prázdný.</p>';
            return;
        }

        let html = '';
        currentProducts.forEach(p => {
            // Use the product image or fall back to the placeholder
            const imageSrc = p.image_url || placeholderSvg;

            html += `
            <div class="admin-item-row" data-id="${p.id}">
                <div class="drag-handle">☰</div>
                <div class="admin-item-img">
                    <img src="${imageSrc}" alt="${sanitize(p.name)}" onerror="this.onerror=null;this.src='${placeholderSvg}';">
                </div>
                <div class="admin-item-info">
                    <strong>${sanitize(p.name)}</strong>
                    <span>${p.price} Kč</span>
                </div>
                <button class="btn-action-secondary btn-sm edit-btn" data-id="${p.id}">✏️ Upravit</button>
            </div>
        `;
        });

        container.innerHTML = html;

        const rows = container.querySelectorAll('.admin-item-row');
        rows.forEach(row => {
            const editBtn = row.querySelector('.edit-btn');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    const id = parseInt(editBtn.getAttribute('data-id'));
                    editProduct(id);
                });
            }
        });

        initDragAndDrop();
    } catch (e) {
        if (e.message !== 'Session expired') {
            container.innerHTML = '<p class="error-msg">Chyba při načítání produktů.</p>';
        }
    }
}

function openProductForm(product = null) {
    document.getElementById('product-list-view').style.display = 'none';
    document.getElementById('product-form-view').style.display = 'block';

    const form = document.getElementById('product-form');
    const title = document.getElementById('form-title');
    const dangerZone = document.getElementById('danger-zone');

    form.reset();
    document.getElementById('form-status').textContent = '';

    if (product) {
        title.textContent = `Úprava: ${product.name}`;
        document.getElementById('prod-id').value = product.id;
        document.getElementById('prod-name').value = product.name;
        document.getElementById('prod-price').value = product.price;
        document.getElementById('prod-sizes').value = product.sizes || '';
        document.getElementById('prod-desc').value = product.description || '';
        document.getElementById('current-image-info').textContent = product.image_url ? 'Nahraný obrázek existuje. Výběrem nového jej přepíšete.' : 'Zatím bez obrázku.';
        document.getElementById('current-gallery-info').textContent = product.gallery_urls ? 'Galerie nahrána. Výběrem nových fotek ji přepíšete.' : 'Bez galerie.';
        dangerZone.style.display = 'block';
    } else {
        title.textContent = 'Nový produkt';
        document.getElementById('prod-id').value = '';
        document.getElementById('current-image-info').textContent = '';
        dangerZone.style.display = 'none';
    }
}

function closeProductForm() {
    document.getElementById('product-form-view').style.display = 'none';
    document.getElementById('product-list-view').style.display = 'block';
}

window.editProduct = (id) => {
    const product = currentProducts.find(p => p.id === id);
    if (product) openProductForm(product);
}

async function handleProductSave(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-product');
    const cancelBtn = document.getElementById('btn-cancel-edit');
    const status = document.getElementById('form-status');

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Ukládám produkt... ⏳';
    btn.style.opacity = '0.7';
    btn.style.cursor = 'wait';

    if (cancelBtn) {
        cancelBtn.disabled = true;
        cancelBtn.style.opacity = '0.5';
        cancelBtn.style.cursor = 'not-allowed';
    }

    const id = document.getElementById('prod-id').value;
    const isEdit = id !== '';
    const imageFile = document.getElementById('prod-image').files[0];

    try {
        let imageUrl = undefined;
        let galleryUrls = undefined;

        // Upload cover image
        if (imageFile) {
            status.textContent = 'Nahrávám hlavní obrázek...';
            const formData = new FormData();
            formData.append('image', imageFile);
            const uploadRes = await apiFetch('/admin/api/upload', { method: 'POST', body: formData });
            const uploadData = await uploadRes.json();
            if (!uploadRes.ok) throw new Error(uploadData.error);
            imageUrl = uploadData.url;
        }

        // Upload gallery
        const galleryFiles = document.getElementById('prod-gallery').files;
        if (galleryFiles && galleryFiles.length > 0) {
            if (galleryFiles.length > 4) throw new Error("Do galerie lze nahrát maximálně 4 fotky.");
            status.textContent = 'Nahrávám galerii...';
            const uploadedUrls = [];

            for (let i = 0; i < galleryFiles.length; i++) {
                const formData = new FormData();
                formData.append('image', galleryFiles[i]);
                const uploadRes = await apiFetch('/admin/api/upload', { method: 'POST', body: formData });
                const uploadData = await uploadRes.json();
                if (!uploadRes.ok) throw new Error(uploadData.error);
                uploadedUrls.push(uploadData.url);
            }
            galleryUrls = uploadedUrls.join(',');
        }

        // Upload product data
        status.textContent = 'Zapisuji do databáze...';
        const payload = {
            name: document.getElementById('prod-name').value,
            price: parseInt(document.getElementById('prod-price').value),
            sizes: document.getElementById('prod-sizes').value,
            description: document.getElementById('prod-desc').value,
            image_url: imageUrl,
            gallery_urls: galleryUrls
        };

        const url = isEdit ? `/admin/api/products/${id}` : '/admin/api/products';
        const method = isEdit ? 'PUT' : 'POST';

        const dbRes = await apiFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!dbRes.ok) throw new Error('Chyba při ukládání do databáze');

        showToast('Uloženo', 'Produkt byl úspěšně aktualizován.', 'success');

        setTimeout(() => {
            closeProductForm();
            loadProducts();
            loadAudit();
        }, 1000);

    } catch (e) {
        if (e.message !== 'Session expired') {
            showToast('Chyba při ukládání', e.message, 'error');
            status.innerHTML = `<span style="color: #ff4d4d;">${e.message}</span>`;
        }
    } finally {
        status.innerHTML = '';
        btn.disabled = false;
        btn.textContent = originalText;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';

        if (cancelBtn) {
            cancelBtn.disabled = false;
            cancelBtn.style.opacity = '1';
            cancelBtn.style.cursor = 'pointer';
        }
    }
}

async function handleProductDelete() {
    const id = document.getElementById('prod-id').value;
    if (!id) return;

    const confirmed = await customConfirm(
        'Smazat produkt?',
        'VAROVÁNÍ: Opravdu chceš tento produkt smazat?\nAkce je trvalá a nevratná!',
        'Trvale smazat',
        'btn-action-danger'
    );

    if (confirmed) {
        try {
            await apiFetch(`/admin/api/products/${id}`, { method: 'DELETE' });
            closeProductForm();
            await loadProducts();
            await loadAudit();
        } catch (error) {
            if (error.message !== 'Session expired') {
                showToast('Chyba', 'Produkt se nepodařilo smazat.', 'error');
            }
        }
    }
}

async function loadAudit() {
    const container = document.getElementById('audit-list-container');
    try {
        const res = await apiFetch('/admin/api/audit');
        const logs = await res.json();

        if (logs.length === 0) {
            container.innerHTML = '<p style="color: rgba(255,255,255,0.5);">Zatím neproběhly žádné akce.</p>';
            return;
        }

        let html = '<table class="admin-table" style="font-size: 0.9rem;"><thead><tr><th>Kdy</th><th>Kdo</th><th>Akce</th><th>Entita</th><th>Detaily</th></tr></thead><tbody>';
        logs.forEach(l => {
            const date = new Date(l.created_at.replace(' ', 'T') + 'Z').toLocaleString('cs-CZ');
            html += `
                <tr>
                    <td style="white-space: nowrap;">${date}</td>
                    <td>${sanitize(l.admin_email)}</td>
                    <td><strong style="color: var(--yellow);">${sanitize(l.action)}</strong></td>
                    <td>${sanitize(l.entity)} #${l.entity_id || ''}</td>
                    <td style="color: #aaa;">${sanitize(l.details)}</td>
                </tr>
            `;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) {
        if (e.message !== 'Session expired') {
            container.innerHTML = '<p>Chyba při načítání auditu.</p>';
        }
    }
}

function initDragAndDrop() {
    const container = document.getElementById('admin-products-list');
    const rows = container.querySelectorAll('.admin-item-row');
    let draggedItem = null;

    rows.forEach(row => {
        const dragHandle = row.querySelector('.drag-handle');
        if (dragHandle) {
            dragHandle.addEventListener('touchstart', () => {
                row.setAttribute('draggable', 'true');
            }, { passive: true, capture: true });

            dragHandle.addEventListener('mousedown', () => {
                row.setAttribute('draggable', 'true');
            });
        }

        row.addEventListener('touchend', () => {
            setTimeout(() => {
                if (!row.classList.contains('dragging')) row.removeAttribute('draggable');
            }, 50);
        }, { passive: true });

        row.addEventListener('mouseup', () => {
            setTimeout(() => {
                if (!row.classList.contains('dragging')) row.removeAttribute('draggable');
            }, 50);
        });

        row.addEventListener('dragstart', function(e) {
            draggedItem = this;
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', this.getAttribute('data-id'));
            }
            setTimeout(() => this.classList.add('dragging'), 0);
        });

        row.addEventListener('dragend', function() {
            this.classList.remove('dragging');
            this.removeAttribute('draggable');
            draggedItem = null;
            checkForChanges();
        });
    });

    container.addEventListener('dragenter', (e) => {
        e.preventDefault();
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

        if (!draggedItem) return;

        const afterElement = getDragAfterElement(container, e.clientY);

        if (afterElement == null) {
            container.appendChild(draggedItem);
        } else {
            container.insertBefore(draggedItem, afterElement);
        }
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
}

function checkForChanges() {
    const currentDOMIds = Array.from(document.querySelectorAll('#admin-products-list .admin-item-row'))
        .map(row => parseInt(row.getAttribute('data-id')));

    const originalIds = currentProducts.map(p => p.id);

    const isChanged = JSON.stringify(currentDOMIds) !== JSON.stringify(originalIds);
    document.getElementById('order-action-bar').style.display = isChanged ? 'flex' : 'none';
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.admin-item-row:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveNewOrder() {
    const btn = document.getElementById('btn-save-order');
    btn.textContent = 'Ukládám...';
    btn.disabled = true;

    const rows = document.querySelectorAll('#admin-products-list .admin-item-row');
    const newOrder = [];

    rows.forEach((row, index) => {
        newOrder.push({
            id: parseInt(row.getAttribute('data-id')),
            position: index
        });
    });

    try {
        await apiFetch('/admin/api/products/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: newOrder })
        });
        showToast('Uloženo', 'Nové pořadí uloženo.', 'success');

        document.getElementById('order-action-bar').style.display = 'none';
        await loadProducts();
    } catch (e) {
        showToast('Chyba', 'Nepodařilo se uložit nové pořadí.', 'error');
    } finally {
        btn.textContent = 'Uložit pořadí';
        btn.disabled = false;
    }
}