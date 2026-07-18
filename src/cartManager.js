export function getCart() {
    return JSON.parse(localStorage.getItem('tjsb_cart')) || [];
}

export function saveCart(cart) {
    localStorage.setItem('tjsb_cart', JSON.stringify(cart));
    updateCartCount();
}

export function addToCart(id, name, price, size = null) {
    const cart = getCart();
    const currentTotalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

    if (currentTotalItems >= 20) {
        return false;
    }

    const existingItem = cart.find(item => item.id === id && item.size === size);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ id, name, price, size, quantity: 1 });
    }

    saveCart(cart);
    return true;
}

export function removeFromCart(id, size = null) {
    let cart = getCart();
    cart = cart.filter(item => !(item.id === id && item.size === size));
    saveCart(cart);
}

export function updateCartCount() {
    const cart = getCart();
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const badge = document.getElementById('cart-count');
    if (badge) {
        badge.textContent = count;
    }
}

export function clearCart() {
    localStorage.removeItem('tjsb_cart');
    updateCartCount();
}

window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        updateCartCount();
    }
});