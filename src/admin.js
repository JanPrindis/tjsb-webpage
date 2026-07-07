import { showToast } from './toast.js';
import { sanitize } from './sanitize.js';
import { OrderStatus } from "./constants.js";

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

document.addEventListener('DOMContentLoaded', () => {
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
let sortConfig = { column: 'created_at', direction: 'desc' };
let searchQuery = '';

async function loadOrders() {
    const container = document.getElementById('orders-list-container');
    try {
        const res = await apiFetch('/admin/api/orders');
        if (!res.ok) throw new Error('Nepodařilo se načíst objednávky.');
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
        container.innerHTML = '<p style="color: rgba(255,255,255,0.5);">Žádné objednávky neodpovídají hledání.</p>';
        return;
    }

    const getArrow = (col) => sortConfig.column === col ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : '';

    let html = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th class="sortable" onclick="sortOrders('id')">ID${getArrow('id')}</th>
                    <th class="sortable" onclick="sortOrders('customer_name')">Zákazník${getArrow('customer_name')}</th>
                    <th class="sortable" onclick="sortOrders('status')">Status${getArrow('status')}</th>
                    <th class="sortable" onclick="sortOrders('created_at')">Vytvořeno${getArrow('created_at')}</th>
                    <th>Akce</th>
                </tr>
            </thead>
            <tbody>
    `;

    filteredOrders.forEach(o => {
        const date = new Date(o.created_at).toLocaleString('cs-CZ');

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
    document.getElementById('modal-order-title').textContent = `Objednávka #${order.id}`;
    const body = document.getElementById('modal-order-body');
    const actions = document.getElementById('modal-order-actions');

    body.innerHTML = '<div class="loader">Načítám položky...</div>';

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
            html += '<p>Tato objednávka je prázdná.</p>';
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
    if (status === 'CANCELED' && !confirm('Opravdu stornovat objednávku?')) return;

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
        showToast('Stav změněn', `Stav objednávky #${id} byl úspěšně aktualizován.`, 'success');

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
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        document.getElementById('order-modal').style.display = 'none';
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
                <div class="admin-item-row" onclick="editProduct(${p.id})">
                    <div class="admin-item-img">
                        <img src="${imageSrc}" alt="${sanitize(p.name)}" onerror="this.onerror=null;this.src='${placeholderSvg}';">
                    </div>
                    <div class="admin-item-info">
                        <strong>${sanitize(p.name)}</strong>
                        <span>${p.price} Kč</span>
                    </div>
                    <button class="btn-action-secondary btn-sm">✏️ Upravit</button>
                </div>
            `;
        });
        container.innerHTML = html;
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
    const status = document.getElementById('form-status');

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Ukládám produkt... ⏳';
    btn.style.opacity = '0.7';
    btn.style.cursor = 'wait';

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
            showToast('Chyba při ukládání', error.message, 'error');
            status.innerHTML = `<span style="color: #ff4d4d;">${error.message}</span>`;
        }
    } finally {
        status.innerHTML = '';
        btn.disabled = false;
        btn.textContent = originalText;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
}

async function handleProductDelete() {
    const id = document.getElementById('prod-id').value;
    if (!id) return;

    if (confirm('VAROVÁNÍ: Opravdu chcete produkt smazat? Akce je nevratná!')) {
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
            const date = new Date(l.created_at).toLocaleString('cs-CZ');
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