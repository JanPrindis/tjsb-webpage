import { updateCartCount } from './cartManager.js';
import { sanitize } from "./sanitize.js";

document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    updateCartCount();
});

async function loadProducts() {
    const grid = document.getElementById('products-grid');
    if (!grid) {
        return;
    }

    // Define the placeholder path
    const placeholderSvg = '/src/assets/camera.svg';

    try {
        const response = await fetch('/api/products');
        const products = await response.json();

        if (products.length === 0) {
            grid.innerHTML = '<p class="info-msg">V tuto chvíli nejsou v nabídce žádné produkty.</p>';
            return;
        }

        grid.innerHTML = '';

        products.forEach(product => {
            // Use the product image or fallback to the placeholder
            const imageSrc = product.image_url || placeholderSvg;

            const cardHTML = `
                <div class="product-card">
                    <a href="/product.html?id=${product.id}">
                        <div class="product-image-wrapper">
                            <img src="${imageSrc}" alt="${sanitize(product.name)}" onerror="this.onerror=null;this.src='${placeholderSvg}';">
                        </div>
                        <h3>${sanitize(product.name)}</h3>
                        <p class="product-price">${product.price} Kč</p>
                    </a>
                </div>
            `;
            grid.innerHTML += cardHTML;
        });
    } catch (error) {
        console.error('Chyba:', error);
        grid.innerHTML = '<p class="error-msg">Nepodařilo se načíst produkty.</p>';
    }
}