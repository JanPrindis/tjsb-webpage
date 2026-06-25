import { addToCart, updateCartCount } from './cartManager.js';

document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    loadProductDetail();
});

async function loadProductDetail() {
    const container = document.getElementById('product-container');
    if (!container) return;

    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if (!productId) {
        container.innerHTML = '<p class="error-msg">Chyba: Produkt nebyl vybrán.</p>';
        return;
    }

    try {
        const response = await fetch(`/api/products/${productId}`);
        if (!response.ok) throw new Error();
        const product = await response.json();

        renderDetail(product, container);
    } catch (error) {
        container.innerHTML = '<p class="error-msg">Nepodařilo se načíst data produktu.</p>';
    }
}

function renderDetail(product, container) {
    const hasSizes = product.sizes && product.sizes.trim() !== '';
    let sizeHTML = '';

    let allImages = [];
    if (product.image_url) allImages.push(product.image_url);
    if (product.gallery_urls) allImages.push(...product.gallery_urls.split(','));

    let imagesHTML = '<div class="no-img-placeholder">Bez obrázku</div>';

    if (allImages.length > 0) {
        if (allImages.length === 1) {
            imagesHTML = `<img src="${allImages[0]}" alt="${product.name}" class="single-product-img">`;
        } else {
            imagesHTML = `
                <div class="swiper mySwiper">
                    <div class="swiper-wrapper">
                        ${allImages.map(imgSrc => `
                            <div class="swiper-slide">
                                <img src="${imgSrc}" alt="${product.name}">
                            </div>
                        `).join('')}
                    </div>
                    <div class="swiper-button-next"></div>
                    <div class="swiper-button-prev"></div>
                    <div class="swiper-pagination"></div>
                </div>
            `;
        }
    }

    if (hasSizes) {
        const sizesArray = product.sizes.split(',').map(s => s.trim());
        sizeHTML = `
            <div class="size-selector-box">
                <label for="size-select" class="form-label">Vyberte velikost:</label>
                <select id="size-select" class="eshop-select">
                    <option value="" disabled selected>-- Zvolte velikost --</option>
                    ${sizesArray.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="product-detail-img-zone">
            ${imagesHTML}
        </div>
        <div class="product-detail-info-zone">
            <h1 class="detail-name">${product.name}</h1>
            <div class="detail-price">${product.price} Kč</div>
            <p class="detail-description">${product.description || 'K tomuto produktu zatím nebyl přidán žádný popis.'}</p>
            
            ${sizeHTML}
            
            <button id="btn-add-to-cart" class="btn-action-primary">
                Přidat do košíku
            </button>
        </div>
    `;

    // Init Swiper
    if (allImages.length > 1) {
        new Swiper(".mySwiper", {
            navigation: {
                nextEl: ".swiper-button-next",
                prevEl: ".swiper-button-prev",
            },
            pagination: {
                el: ".swiper-pagination",
                clickable: true,
            },
            loop: true,
            grabCursor: true,
        });
    }

    // Add to cart button
    document.getElementById('btn-add-to-cart').addEventListener('click', () => {
        let selectedSize = null;
        if (hasSizes) {
            const select = document.getElementById('size-select');
            selectedSize = select.value;
            if (!selectedSize) {
                select.classList.add('input-error');
                setTimeout(() => select.classList.remove('input-error'), 400);
                return;
            }
        }

        const success = addToCart(product.id, product.name, product.price, selectedSize);
        if (success) {
            showToast(product.name, selectedSize);
        } else {
            alert('Do košíku se vejde maximálně 20 položek. Pro hromadnou objednávku nás prosím kontaktujte napřímo.');
        }
    });

    // --- LIGHTBOX ---
    const lightbox = document.getElementById('image-lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxClose = document.querySelector('.lightbox-close');

    lightboxClose.onclick = () => lightbox.classList.remove('active');
    lightbox.onclick = (e) => {
        if (e.target !== lightboxImg) lightbox.classList.remove('active');
    };

    const productImages = container.querySelectorAll('.product-detail-img-zone img');
    productImages.forEach(img => {
        img.addEventListener('click', () => {
            lightboxImg.src = img.src;
            lightbox.classList.add('active');
        });
    });
}

window.changeMainImage = (src, thumbElem) => {
    document.getElementById('main-product-img').src = src;

    document.querySelectorAll('.thumb-img').forEach(el => el.classList.remove('active-thumb'));
    thumbElem.classList.add('active-thumb');
}

function showToast(productName, size) {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `
        <div class="toast-icon">✅</div>
        <div class="toast-text">
            <strong>Přidáno do košíku</strong>
            <span>${productName} ${size ? `(Velikost: ${size})` : ''}</span>
        </div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 3000);

    const cartBtn = document.querySelector('.cart-btn');
    if (cartBtn) {
        cartBtn.classList.remove('cart-bump');
        void cartBtn.offsetWidth;
        cartBtn.classList.add('cart-bump');
    }
}