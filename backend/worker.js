import { Hono } from 'hono'

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
    const uniqueProductIds = [...new Set(items.map(i => i.id))]
    const placeholders = uniqueProductIds.map(() => '?').join(',')

    const existing = await c.env.DB.prepare(
        `SELECT id FROM products WHERE id IN (${placeholders})`
    ).bind(...uniqueProductIds).all()

    if (existing.results.length !== uniqueProductIds.length) {
        return c.json({ error: 'Některé produkty v objednávce neexistují' }, 400)
    }

    // Safe write to db
    const orderResult = await c.env.DB.prepare(
        'INSERT INTO orders (customer_name, customer_email, customer_phone, status) VALUES (?, ?, ?, ?)'
    ).bind(customer_name, customer_email, customer_phone.replace(/\s/g, ''), 'PENDING').run()

    const orderId = orderResult.meta.last_row_id

    const stmts = items.map(item =>
        c.env.DB.prepare(
            'INSERT INTO order_items (order_id, product_id, product_name, size, quantity, price) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(orderId, item.id, item.name, item.size || null, item.quantity, item.price)
    )

    await c.env.DB.batch(stmts)

    return c.json({ success: true, orderId })
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

    // Delete old cover image from R2 if new provided
    if (image_url && oldData.image_url && image_url !== oldData.image_url) {
        const oldPath = oldData.image_url.replace('/assets/', '')
        if (oldPath) await c.env.BUCKET.delete(oldPath)
    }

    // Delete old gallery from R2 if new provided
    if (gallery_urls !== undefined && oldData.gallery_urls && gallery_urls !== oldData.gallery_urls) {
        const oldGallery = oldData.gallery_urls.split(',')
        for (const url of oldGallery) {
            const key = url.replace('/assets/', '')
            if (key) await c.env.BUCKET.delete(key)
        }
    }

    const finalImage = image_url !== undefined ? image_url : oldData.image_url
    const finalGallery = gallery_urls !== undefined ? gallery_urls : oldData.gallery_urls

    await c.env.DB.prepare(
        'UPDATE products SET name = ?, price = ?, description = ?, image_url = ?, gallery_urls = ?, sizes = ? WHERE id = ?'
    ).bind(name, price, description, finalImage, finalGallery, sizes, id).run()

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
    return c.json({ error: 'Interní chyba serveru' }, 500)
})

app.notFound((c) => c.json({ error: 'Endpoint nenalezen' }, 404))

export default app