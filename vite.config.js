import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
    server: {
        proxy: {
            '/api': 'http://127.0.0.1:8787',
            '/admin/api': 'http://localhost:8787'
        }
    },
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                eshop: resolve(__dirname, 'eshop.html'),
                product: resolve(__dirname, 'product.html'),
                cart: resolve(__dirname, 'cart.html'),
                success: resolve(__dirname, 'success.html'),
                gdpr: resolve(__dirname, 'gdpr.html'),
                admin: resolve(__dirname, 'admin.html')
            }
        }
    }
})