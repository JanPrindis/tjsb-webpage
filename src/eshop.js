document.addEventListener('DOMContentLoaded', () => {
    loadProducts();

    if (sessionStorage.getItem('tjsb_order_success')) {
        sessionStorage.removeItem('tjsb_order_success');
        showOrderSuccessToast();
    }
});

async function loadProducts() {
    const grid = document.getElementById('products-grid');
    if (!grid) {return;}

    try {
        const response = await fetch('/api/products');
        const products = await response.json();

        grid.innerHTML = '';

        products.forEach(product => {
            const cardHTML = `
                <div class="product-card">
                    <div class="product-image-wrapper">
                        ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}">` : '<span>Bez obrázku</span>'}
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

function showOrderSuccessToast() {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';

    toast.innerHTML = `
        <div class="toast-icon">✅</div>
        <div class="toast-text">
            <strong>Rezervace úspěšná!</strong>
            <span>Objednávka přijata, ozveme se ti.</span>
        </div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 4000);
}