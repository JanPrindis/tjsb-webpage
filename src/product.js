import { addToCart, updateCartCount } from './cartManager.js';
import { showToast } from './toast.js';
import { sanitize } from './sanitize.js';

const placeholderSvg = '/src/assets/camera.svg';

document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    loadProductDetails();

    // Lightbox setup
    const lightbox = document.getElementById('image-lightbox');
    const lightboxClose = document.querySelector('.lightbox-close');
    if (lightbox && lightboxClose) {
        lightboxClose.addEventListener('click', () => lightbox.classList.remove('active'));
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) lightbox.classList.remove('active');
        });
    }
});

async function loadProductDetails() {
    const container = document.getElementById('product-container');
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if (!productId) {
        container.innerHTML = '<p class="error-msg">Produkt nebyl specifikován.</p>';
        return;
    }

    try {
        const response = await fetch(`/api/products/${productId}`);
        if (!response.ok) throw new Error('Produkt nenalezen');
        const product = await response.json(); // 'product' is now correctly scoped to this block

        renderDetail(product, container);
    } catch (error) {
        container.innerHTML = '<p class="error-msg">Nepodařilo se načíst data produktu.</p>';
    }
}

function renderDetail(product, container) {
    const hasSizes = product.sizes && product.sizes.trim() !== '';
    let sizeHTML = '';

    // Title
    document.title = `${sanitize(product.name)} | TJ Sokol Bohuňovice`;

    let allImages = [];
    if (product.image_url) allImages.push(product.image_url);
    if (product.gallery_urls) allImages.push(...product.gallery_urls.split(','));
    allImages = [...new Set(allImages)]; // Remove duplicates

    let imagesHTML;

    if (allImages.length === 0) {
        imagesHTML = `<img src="${placeholderSvg}" alt="Bez obrázku" class="single-product-img">`;
    } else if (allImages.length === 1) {
        imagesHTML = `<img src="${allImages[0]}" alt="${sanitize(product.name)}" class="single-product-img" onerror="this.onerror=null;this.src='${placeholderSvg}';">`;
    } else {
        imagesHTML = `
            <div class="swiper mySwiper">
                <div class="swiper-wrapper">
                    ${allImages.map(imgSrc => `
                        <div class="swiper-slide">
                            <img src="${imgSrc}" alt="${sanitize(product.name)}" onerror="this.onerror=null;this.src='${placeholderSvg}';">
                        </div>
                    `).join('')}
                </div>
                <div class="swiper-button-next"></div>
                <div class="swiper-button-prev"></div>
                <div class="swiper-pagination"></div>
            </div>
        `;
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
                <br>
                <a href="/velikosti.html" class="size-link">Tabulka velikostí</a>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="product-detail-img-zone">
            ${imagesHTML}
        </div>
        <div class="product-detail-info-zone">
            <h1 class="detail-name">${sanitize(product.name)}</h1>
            <div class="detail-price">${product.price} Kč</div>
            <p class="detail-description">${sanitize(product.description) || 'K tomuto produktu zatím nebyl přidán žádný popis.'}</p>
            
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
            autoplay: {
                delay: 5000,
            }
        });
    }

    // Add to cart button
    const addToCartBtn = document.getElementById('btn-add-to-cart');
    addToCartBtn.addEventListener('click', () => {
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
            // Disable the button and change its appearance
            addToCartBtn.disabled = true;
            addToCartBtn.classList.add('success');
            addToCartBtn.innerHTML = 'Přidáno';

            // Show the toast notification
            showToast('Přidáno', `${product.name}${selectedSize ? `, Velikost ${selectedSize}` : ''}`);

            // Revert the button to its original state
            setTimeout(() => {
                addToCartBtn.disabled = false;
                addToCartBtn.classList.remove('success');
                addToCartBtn.innerHTML = 'Přidat do košíku';
            }, 1000);

        } else {
            alert('Do košíku se vejde maximálně 20 položek. Pro hromadnou objednávku nás prosím kontaktujte napřímo.');
        }
    });

    // Lightbox
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