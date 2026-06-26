import { Hono } from 'hono'
import { sendOrderConfirmation} from "../src/email.js";

const app = new Hono()

// ============================================
// Audit log helper
// ============================================
async function logAction(db, email, action, entity, entityId, details) {
    try {
        await db.prepare(
            'INSERT INTO audit_logs (admin_email, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)'
        ).bind(email, action, entity, entityId, JSON.stringify(details)).run()
    } catch (e) {
        console.error('Audit log failed:', e)
    }
}

// ============================================
// PUBLIC ROUTES (E-shop & Cart)
// ============================================

// All products
app.get('/api/products', async (c) => {
    const { results } = await c.env.DB.prepare('SELECT * FROM products ORDER BY id DESC').all()
    return c.json(results)
})

// Product details
app.get('/api/products/:id', async (c) => {
    const id = c.req.param('id')
    const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first()

    if (!product) return c.json({ error: 'Produkt nenalezen' }, 404)
    return c.json(product)
})

// Create new order
app.post('/api/orders', async (c) => {
    const { customer_name, customer_email, customer_phone, items, honeypot } = await c.req.json()

    if (honeypot) {
        return c.json({ error: 'Spam detekován' }, 400)
    }

    // Frontend validation
    if (!customer_name || !customer_email || !customer_phone || !items || items.length === 0) {
        return c.json({ error: 'Neplatná data objednávky' }, 400)
    }

    if (items.length > 20) {
        return c.json({ error: 'Příliš mnoho položek (max 20)' }, 400)
    }

    // Backend validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(customer_email)) {
        return c.json({ error: 'Neplatný formát e-mailu' }, 400)
    }

    const phoneRegex = /^(\+420|420)?[1-9][0-9]{8}$/
    if (!phoneRegex.test(customer_phone.replace(/\s/g, ''))) {
        return c.json({ error: 'Neplatný formát telefonu' }, 400)
    }

    // Check if products exist
    const productIds = [...new Set(items.map(i => i.id))];
    const placeholders = productIds.map(() => '?').join(',');

    const { results: dbProducts } = await c.env.DB.prepare(
        `SELECT id, name, price FROM products WHERE id IN (${placeholders})`
    ).bind(...productIds).all();

    // Create a map for easy lookup
    const productMap = new Map(dbProducts.map(p => [p.id, p]));

    // Verify all products were found
    if (productMap.size !== productIds.length) {
        return c.json({ error: 'Některé produkty v košíku již neexistují. Zkuste prosím obnovit stránku.' }, 400);
    }

    // Generate cancellation token
    const cancelToken = crypto.randomUUID()

    // Safe write to db
    const orderResult = await c.env.DB.prepare(
        'INSERT INTO orders (customer_name, customer_email, customer_phone, status, cancel_token) VALUES (?, ?, ?, ?, ?)'
    ).bind(customer_name, customer_email, customer_phone.replace(/\s/g, ''), 'PENDING', cancelToken).run()

    const orderId = orderResult.meta.last_row_id

    const stmts = items.map(item => {
        const dbProduct = productMap.get(item.id); // Get the trusted product data
        return c.env.DB.prepare(
            'INSERT INTO order_items (order_id, product_id, product_name, size, quantity, price) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(orderId, item.id, dbProduct.name, item.size || null, item.quantity, dbProduct.price); // Use dbProduct.name and dbProduct.price
    });

    await c.env.DB.batch(stmts)

    const host = new URL(c.req.url).origin
    const cancelLink = `${host}/api/cancel?id=${orderId}&token=${cancelToken}`

    if (c.env.ENABLE_EMAILS !== 'true') {
        console.log(`[EMAIL LINK] E-mails are disabled. Cancel link for order: \n${cancelLink}`);
    }

    const verifiedItems = items.map(cartItem => {
        const dbProduct = productMap.get(cartItem.id);
        return {
            ...cartItem,
            name: dbProduct.name,
            price: dbProduct.price
        };
    });

    c.executionCtx.waitUntil(
        sendOrderConfirmation(
            c.env,
            orderId,
            customer_name,
            customer_email,
            customer_phone,
            verifiedItems,
            cancelLink
        )
    )

    return c.json({ success: true, orderId })
})

// Customer order cancellation
app.get('/api/cancel', async (c) => {
    const id = c.req.query('id')
    const token = c.req.query('token')

    if (!id || !token) {
        return c.html('<div style="font-family: sans-serif; text-align: center; margin-top: 50px;"><h1>Chyba</h1><p>Neplatný nebo poškozený odkaz.</p></div>', 400)
    }

    const order = await c.env.DB.prepare(
        'SELECT status, cancel_token FROM orders WHERE id = ?'
    ).bind(id).first()

    if (!order || order.cancel_token !== token) {
        return c.html('<div style="font-family: sans-serif; text-align: center; margin-top: 50px;"><h1 style="color: #dc3545;">Přístup odepřen</h1><p>Tento odkaz není platný pro zrušení dané objednávky.</p></div>', 403)
    }

    if (order.status === 'CANCELED' || order.status === 'CANCELED_BY_USER') {
        return c.html('<div style="font-family: sans-serif; text-align: center; margin-top: 50px;"><h1>Již zrušeno</h1><p>Tato rezervace již byla stornována dříve.</p></div>')
    }

    if (order.status !== 'PENDING') {
        return c.html('<div style="font-family: sans-serif; text-align: center; margin-top: 50px;"><h1>Nelze zrušit</h1><p>Tuto objednávku již nelze automaticky stornovat. Pravděpodobně se již připravuje, nebo byla vyřízena. Kontaktujte nás prosím přímo.</p></div>', 400)
    }

    await c.env.DB.prepare(
        'UPDATE orders SET status = ? WHERE id = ?'
    ).bind('CANCELED_BY_USER', id).run()

    return c.html(`
        <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 10vh; color: #111a3b;">
            <div style="font-size: 4rem; margin-bottom: 1rem;">🗑️</div>
            <h1 style="color: #dc3545;">Rezervace byla úspěšně stornována</h1>
            <a href="/eshop.html" style="display: inline-block; margin-top: 2rem; padding: 0.8rem 1.5rem; background: #111a3b; color: #ffd700; text-decoration: none; border-radius: 6px; font-weight: bold;">Zpět na e-shop</a>
        </div>
    `)
})


// ============================================
// ADMIN MIDDLEWARE
// ============================================
const requireAccessAuth = async (c, next) => {
    // Local dev
    if (c.env.ENVIRONMENT === 'development') {
        c.set('adminEmail', 'local-dev@tjsb.cz')
        return await next()
    }

    // Production - Cloudflare Access
    const email = c.req.header('CF-Access-Authenticated-User-Email')
    const jwt = c.req.header('CF-Access-Jwt-Assertion')

    if (!email || !jwt) {
        return c.json({ error: 'Neautorizováno. Chybí hlavičky Cloudflare Access.' }, 403)
    }

    c.set('adminEmail', email)
    await next()
}

// Apply middleware to all routes under /admin/api/
app.use('/admin/api/*', requireAccessAuth)


// ============================================
// ADMIN ROUTES - Product management
// ============================================

// R2 Bucket image upload
app.post('/admin/api/upload', async (c) => {
    const formData = await c.req.formData()
    const file = formData.get('image')

    if (!file || typeof file === 'string') {
        return c.json({ error: 'Nebyl poskytnut žádný soubor' }, 400)
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
        return c.json({ error: 'Nepovolený formát. Použijte JPG, PNG nebo WebP.' }, 400)
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').toLowerCase()
    const key = `products/${Date.now()}-${safeName}`

    await c.env.BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: file.type }
    })

    // Generate url based on environment
    let publicUrl;
    if (c.env.ENVIRONMENT === 'development') {
        publicUrl = `/assets/${key}`
    } else {
        publicUrl = `https://assets.tjsbfotbal.cz/${key}`
    }

    return c.json({ success: true, url: publicUrl })
})

// Local dev helper
app.get('/assets/*', async (c) => {
    const path = new URL(c.req.url).pathname
    const key = path.replace('/assets/', '')

    const object = await c.env.BUCKET.get(key)
    if (!object) return c.json({ error: 'Obrázek nenalezen' }, 404)

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    return new Response(object.body, { headers })
})

// Create new product
app.post('/admin/api/products', async (c) => {
    const { name, price, description, image_url, gallery_urls, sizes } = await c.req.json()
    const adminEmail = c.get('adminEmail')

    const result = await c.env.DB.prepare(
        'INSERT INTO products (name, price, description, image_url, gallery_urls, sizes) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(name, price, description, image_url || null, gallery_urls || null, sizes || null).run()

    const productId = result.meta.last_row_id
    await logAction(c.env.DB, adminEmail, 'CREATE', 'PRODUCT', productId, { name, price })

    return c.json({ success: true, productId })
})

// Edit existing product
app.put('/admin/api/products/:id', async (c) => {
    const id = c.req.param('id')
    const { name, price, description, image_url, gallery_urls, sizes } = await c.req.json()
    const adminEmail = c.get('adminEmail')

    const oldData = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first()
    if (!oldData) return c.json({ error: 'Nenalezeno' }, 404)

    const newImageUrl = image_url !== undefined ? image_url : oldData.image_url;
    const newGalleryUrls = gallery_urls !== undefined ? gallery_urls : oldData.gallery_urls;

    // If the old image exists and is being changed or removed, delete it from R2
    if (oldData.image_url && oldData.image_url !== newImageUrl) {
        const oldKey = oldData.image_url.split('/').pop();
        if (oldKey) await c.env.BUCKET.delete(`products/${oldKey}`);
    }

    // If the old gallery exists, find which images were removed and delete them
    if (oldData.gallery_urls) {
        const oldUrls = oldData.gallery_urls.split(',');
        const newUrlsList = newGalleryUrls ? newGalleryUrls.split(',') : [];
        const urlsToDelete = oldUrls.filter(url => !newUrlsList.includes(url));

        for (const url of urlsToDelete) {
            const oldKey = url.split('/').pop();
            if (oldKey) await c.env.BUCKET.delete(`products/${oldKey}`);
        }
    }

    await c.env.DB.prepare(
        'UPDATE products SET name = ?, price = ?, description = ?, image_url = ?, gallery_urls = ?, sizes = ? WHERE id = ?'
    ).bind(name, price, description, newImageUrl, newGalleryUrls, sizes, id).run()

    await logAction(c.env.DB, adminEmail, 'UPDATE', 'PRODUCT', id, { name })
    return c.json({ success: true })
})

// Delete product
app.delete('/admin/api/products/:id', async (c) => {
    const id = c.req.param('id')
    const adminEmail = c.get('adminEmail')

    const product = await c.env.DB.prepare('SELECT name, image_url, gallery_urls FROM products WHERE id = ?').bind(id).first()
    if (!product) return c.json({ error: 'Nenalezeno' }, 404)

    // Delete images from R2
    const filesToDelete = []
    if (product.image_url) filesToDelete.push(product.image_url.replace('/assets/', ''))
    if (product.gallery_urls) {
        product.gallery_urls.split(',').forEach(url => filesToDelete.push(url.replace('/assets/', '')))
    }

    for (const key of filesToDelete) {
        if (key) await c.env.BUCKET.delete(key)
    }

    await c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run()
    await logAction(c.env.DB, adminEmail, 'DELETE', 'PRODUCT', id, { name: product.name })

    return c.json({ success: true })
})


// ============================================
// ADMIN ROUTES: Orders & Audit
// ============================================

// Get order list
app.get('/admin/api/orders', async (c) => {
    const { results } = await c.env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC').all()
    return c.json(results)
})

// Get order detail
app.get('/admin/api/orders/:id/items', async (c) => {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(id).all()
    return c.json(results)
})

// Change order status
app.put('/admin/api/orders/:id/status', async (c) => {
    const id = c.req.param('id')
    const { status } = await c.req.json()
    const adminEmail = c.get('adminEmail')

    // Sanity check
    const currentOrder = await c.env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(id).first()

    if (!currentOrder) {
        return c.json({ error: 'Objednávka nenalezena.' }, 404)
    }

    if (currentOrder.status === 'CANCELED_BY_USER') {
        return c.json({ error: 'Objednávku nelze změnit, protože již byla stornována zákazníkem.' }, 409)
    }

    await c.env.DB.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(status, id).run()
    await logAction(c.env.DB, adminEmail, 'STATUS_CHANGE', 'ORDER', id, { novy_status: status })

    return c.json({ success: true })
})

// Print audit log (limit 100)
app.get('/admin/api/audit', async (c) => {
    const { results } = await c.env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all()
    return c.json(results)
})


// ============================================
// ERROR FALLBACK
// ============================================
app.onError((err, c) => {
    console.error('API Error:', err)
    return c.json({ error: 'Chyba serveru' }, 500)
})

app.notFound((c) => c.json({ error: 'Endpoint nenalezen' }, 404))

export default {
    fetch: app.fetch,

    async scheduled(event, env, ctx) {
        console.log("[CRON] Running database cleanup...");

        try {
            // Delete old orders and audit logs
            const ordersResult = await env.DB.prepare(`
                DELETE FROM orders 
                WHERE created_at <= datetime('now', '-1 month') 
                AND status IN ('COMPLETED', 'CANCELED')
            `).run();

            // Delete week old logs
            const logsResult = await env.DB.prepare(`
                DELETE FROM audit_logs 
                WHERE created_at <= datetime('now', '-7 days')
            `).run();

            // Log cleanup
            const details = JSON.stringify({
                deleted_orders: ordersResult.meta.changes,
                deleted_logs: logsResult.meta.changes
            });

            await env.DB.prepare(`
                INSERT INTO audit_logs (admin_email, action, entity, details) 
                VALUES (?, ?, ?, ?)
            `).bind('system@cron', 'SYSTEM_CLEANUP', 'DATABASE', details).run();

            console.log(`[CRON SUCCESS] Cleanup completed. Removed: ${ordersResult.meta.changes} old orders, removed: ${logsResult.meta.changes} old logs`);
        } catch (e) {
            console.error("[CRON ERROR] Error during cleanup:", e);
        }
    }
};