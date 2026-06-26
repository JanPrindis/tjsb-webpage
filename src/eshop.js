import { getCart } from './cartManager.js';

document.addEventListener('DOMContentLoaded', () => {
    loadProducts();

    const cart = getCart();
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const cartCountElem = document.getElementById('cart-count');
    
    if (cartCountElem) {
        cartCountElem.textContent = totalItems;
    }

    if (sessionStorage.getItem('tjsb_order_success')) {
        sessionStorage.removeItem('tjsb_order_success');
        showOrderSuccessToast();
    }
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

        grid.innerHTML = '';

        products.forEach(product => {
            // Use the product image or fallback to the placeholder
            const imageSrc = product.image_url || placeholderSvg;

            const cardHTML = `
                <div class="product-card">
                    <div class="product-image-wrapper">
                        <img src="${imageSrc}" alt="${product.name}" onerror="this.onerror=null;this.src='${placeholderSvg}';">
                    </div>
                    <h3>${product.name}</h3>
                    <p class="product-price">${product.price} Kč</p>
                    <a href="/product.html?id=${product.id}" class="btn-detail">Detail produktu</a>
                </div>
            `;
            grid.innerHTML += cardHTML;
        });
    } catch (error) {
        console.error('Chyba:', error);
        grid.innerHTML = '<p>Nepodařilo se načíst produkty.</p>';
    }
}