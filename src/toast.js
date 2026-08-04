import {sanitize} from "./utils.js";

const TOAST_CONFIG = {
    success: {
        icon: '✅',
        className: 'toast-success'
    },
    error: {
        icon: '❌',
        className: 'toast-error'
    }
};

export function showToast(title, message, type = 'success') {
    // Remove any existing toast to prevent overlap
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    const config = TOAST_CONFIG[type] || TOAST_CONFIG.success;

    const toast = document.createElement('div');
    toast.className = `toast-notification ${config.className}`;

    toast.innerHTML = `
        <div class="toast-icon">${config.icon}</div>
        <div class="toast-text">
            <strong>${sanitize(title)}</strong>
            <span>${sanitize(message)}</span>
        </div>
    `;

    document.body.appendChild(toast);

    // Automatically remove the toast after a few seconds
    setTimeout(() => {
        // Check if the toast is still in the DOM before trying to remove it
        if (toast.parentElement) {
            toast.remove();
        }
    }, 4000);
}
