import { sanitize } from "./sanitize.js";

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('success-container');
    const orderDataStr = sessionStorage.getItem('tjsb_last_order');

    if (!orderDataStr) {
        window.location.href = '/eshop.html';
        return;
    }

    const order = JSON.parse(orderDataStr);

    // Draw items
    const itemsHtml = order.items.map(item => `
        <li class="summary-item">
            <span class="sum-name">${item.quantity}x ${sanitize(item.name)} ${item.size ? `<small>(Vel: ${sanitize(item.size)})</small>` : ''}</span>
            <span class="sum-price">${item.price * item.quantity} Kč</span>
        </li>
    `).join('');
    
    
    console.log(order);

    container.innerHTML = `
        <div class="success-header">
            <div class="success-icon">✅</div>
            <h2 style="color: var(--yellow, #ffd700); margin-bottom: 0.5rem;">Děkujeme za rezervaci, ${sanitize(order.customerName.split(' ')[0])}!</h2>
            <p style="color: rgba(255,255,255,0.8); margin: 0;">Shrnutí rezervace jsme vám poslali na e-mail.</p>
        </div>

        <div class="summary-section">
            <h3>Vaše údaje</h3>
            <p style="color: rgba(255,255,255,0.8); margin: 0;">
                Jméno: ${sanitize(order.customerName)}<br>
                E-mail: ${sanitize(order.customerEmail)}<br>
                Telefon: ${sanitize(order.customerPhone)}
            </p>
        </div>

        <div class="summary-section">
            <h3>Shrnutí položek</h3>
            <ul class="summary-list">
                ${itemsHtml}
            </ul>
            <div class="summary-total">
                Celkem k úhradě: ${order.totalPrice} Kč
            </div>
        </div>

        <div style="text-align: center; margin-top: 2.5rem;">
            <p style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 1.5rem;">
                Až pro vás věci nachystáme, ozveme se vám na zadaný e-mail nebo telefon.
            </p>
            <a href="/eshop.html" class="btn-action-primary" style="text-decoration: none; display: inline-block;">Vrátit se do e-shopu</a>
        </div>
    `;

    // Clear storage
    sessionStorage.removeItem('tjsb_last_order');
});