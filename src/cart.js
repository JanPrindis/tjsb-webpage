import { getCart, removeFromCart, updateCartCount, clearCart } from './cartManager.js';
import { showToast } from './toast.js';
import { sanitize } from "./sanitize.js";

let turnstileToken = '';

window.turnstileSuccess = function(token) {
    turnstileToken = token;
    const btn = document.getElementById('submitOrderBtn');

    // Unlock the button
    btn.disabled = false;
    btn.style.opacity = 1;
    btn.style.cursor = 'pointer';
};

window.turnstileExpired = function() {
    turnstileToken = '';
    const btn = document.getElementById('submitOrderBtn');

    // Re-lock the button
    btn.disabled = true;
    btn.style.opacity = 0.5;
    btn.style.cursor = 'not-allowed';
};

document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    renderCartPage();

    const form = document.getElementById('checkout-form');
    if (form) form.addEventListener('submit', handleCheckoutSubmit);
});

function renderCartPage() {
    const tableContainer = document.getElementById('cart-table-container');
    const form = document.getElementById('checkout-form');
    const cart = getCart();

    if (cart.length === 0) {
        tableContainer.innerHTML = `
            <div class="empty-cart-box">
                <p>Tvůj košík je prázdný.</p>
                <a href="/eshop.html" class="btn-action-primary" style="display:inline-block; text-decoration:none;">Pojďme to napravit!</a>
            </div>
        `;
        form.style.display = 'none';
        return;
    }

    form.style.display = 'block';

    let total = 0;
    let rowsHTML = '';

    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;

        rowsHTML += `
            <div class="cart-row">
                <div class="cart-row-main">
                    <span class="cart-item-name">${sanitize(item.name)}</span>
                    ${item.size ? `<span class="cart-item-size">Velikost: <strong>${sanitize(item.size)}</strong></span>` : ''}
                </div>
                <div class="cart-row-details">
                    <span>${item.quantity}x</span>
                    <span>${item.price} Kč</span>
                    <span class="cart-item-subtotal">${itemTotal} Kč</span>
                    <button class="btn-delete-item" data-id="${item.id}" data-size="${sanitize(item.size || '')}">✕</button>
                </div>
            </div>
        `;
    });

    tableContainer.innerHTML = `
        <div class="cart-items-list">
            ${rowsHTML}
        </div>
        <div class="cart-total-bar">
            <span>Celková cena rezervace:</span>
            <span class="total-price-value">${total} Kč</span>
        </div>
    `;

    document.querySelectorAll('.btn-delete-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.target.getAttribute('data-id'));
            const size = e.target.getAttribute('data-size') || null;

            removeFromCart(id, size);
            renderCartPage();
        });
    });
}

async function handleCheckoutSubmit(e) {
    e.preventDefault();

    // Phone number verification
    const phoneInput = document.getElementById('cust-phone');
    const phoneValue = phoneInput.value.replace(/\s/g, '');
    const phoneRegex = /^(\+420|420)?[1-9][0-9]{8}$/;

    const honeypotInput = document.getElementById('website-url');

    if (!phoneRegex.test(phoneValue)) {
        phoneInput.focus();
        phoneInput.classList.add('input-error');
        return;
    }

    const cart = getCart();
    if (cart.length === 0) return;

    // GDPR check
    const legalCheck = document.getElementById('legal-agreement');
    const legalLabel = document.getElementById('legal-label');

    if (!legalCheck.checked) {
        legalLabel.style.color = '#ff4d4d';
        legalCheck.focus();
        return;
    } else {
        legalLabel.style.color = 'rgba(255,255,255,0.8)';
    }

    const submitBtn = document.querySelector('#checkout-form button[type="submit"]');
    const originalText = submitBtn.textContent;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Odesílám rezervaci... ⏳';
    submitBtn.style.opacity = '0.7';
    submitBtn.style.cursor = 'wait';

    const orderData = {
        customer_name: document.getElementById('cust-name').value,
        customer_email: document.getElementById('cust-email').value,
        customer_phone: document.getElementById('cust-phone').value,
        items: cart,
        turnstileToken: turnstileToken,
        honeypot: honeypotInput ? honeypotInput.value : ''
    };

    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Nastala chyba při odesílání rezervace.');
        }

        const orderSummary = {
            customerName: document.getElementById('cust-name').value,
            customerEmail: document.getElementById('cust-email').value,
            customerPhone: document.getElementById('cust-phone').value,
            items: cart,
            totalPrice: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
        };
        sessionStorage.setItem('tjsb_last_order', JSON.stringify(orderSummary));

        clearCart();
        window.location.href = '/success.html';

    } catch (error) {
        showToast('Chyba rezervace', error.message, 'error');
        console.error(error)

        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
    }
}