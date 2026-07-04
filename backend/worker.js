import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { sendOrderConfirmation, sendUncollectedEmail, sendCustomerCancelEmail, sendAdminCancelEmail } from "../src/email.js";
import { OrderStatus } from "../src/constants.js";

const app = new Hono()

// ============================================
// CORS setup
// ============================================
app.use('/*', cors({
    origin: (origin) => {
        const allowedOrigins = [
            'https://www.tjsbfotbal.cz',
            'https://eshop.tjsbfotbal.cz',
            'http://localhost:8787',
            'http://localhost:3000'
        ];

        if (allowedOrigins.includes(origin)) {
            return origin;
        }

        return 'https://www.tjsbfotbal.cz';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
}))

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
// Cloudflare Turnstile helper
// ============================================
async function validateTurnstile(token, secret, connectingIp) {
    try {
        const response = await fetch(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    secret: secret,
                    response: token,
                    remoteip: connectingIp,
                }),
            },
        );

        return await response.json();
    } catch (error) {
        console.error("Turnstile validation error:", error);
        return { success: false, "error-codes": ["internal-error"] };
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
    const { customer_name, customer_email, customer_phone, items, turnstileToken, honeypot } = await c.req.json()

    if (honeypot) {
        return c.json({ error: 'Spam detekován' }, 400)
    }

    // Turnstile validation
    if (!turnstileToken) {
        return c.json({ error: 'Prosím, prokažte, že nejste robot.' }, 400)
    }

    const turnstileResult = await validateTurnstile(
        turnstileToken,
        c.env.TURNSTILE_TOKEN,
        c.req.header(`cf-connecting-ip`)
    );

    if (!turnstileResult.success) {
        console.error(`Turnstile fail:`, turnstileResult['error-codes']);
        return c.json({ error: 'Bezpečnostní ověření selhalo. Obnovte prosím stránku a zkuste to znovu.' }, 400);
    }

    // Frontend validation
    if (!customer_name || !customer_email || !customer_phone || !items || items.length === 0) {
        return c.json({ error: 'Neplatná data objednávky' }, 400)
    }

    if (items.length > 20) {
        return c.json({ error: 'Příliš mnoho položek (max 20)' }, 400)
    }

    // Backend validation
    if (customer_name.length > 100 || customer_email.length > 100 || customer_phone.length > 20) {
        return c.json({ error: 'Některý z údajů je příliš dlouhý.' }, 400)
    }

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

    // Check if the product quantities are valid
    for (const item of items) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
            return c.json({ error: 'Neplatné množství u produktu.' }, 400)
        }
    }

    // Generate cancellation token
    const cancelToken = crypto.randomUUID()

    // Safe write to db
    const orderResult = await c.env.DB.prepare(
        'INSERT INTO orders (customer_name, customer_email, customer_phone, status, cancel_token) VALUES (?, ?, ?, ?, ?)'
    ).bind(customer_name, customer_email, customer_phone.replace(/\s/g, ''), OrderStatus.PENDING, cancelToken).run()

    const orderId = orderResult.meta.last_row_id

    const stmts = items.map(item => {
        const dbProduct = productMap.get(item.id); // Get the trusted product data
        return c.env.DB.prepare(
            'INSERT INTO order_items (order_id, product_id, product_name, size, quantity, price) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(orderId, item.id, dbProduct.name, item.size || null, item.quantity, dbProduct.price);
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
        'SELECT status, cancel_token, customer_name, customer_email FROM orders WHERE id = ?'
    ).bind(id).first()

    if (!order || order.cancel_token !== token) {
        return c.html('<div style="font-family: sans-serif; text-align: center; margin-top: 50px;"><h1 style="color: #dc3545;">Přístup odepřen</h1><p>Tento odkaz není platný pro zrušení dané objednávky.</p></div>', 403)
    }

    if (order.status === OrderStatus.CANCELED || order.status === OrderStatus.CANCELED_BY_USER) {
        return c.html('<div style="font-family: sans-serif; text-align: center; margin-top: 50px;"><h1>Již zrušeno</h1><p>Tato rezervace již byla stornována dříve.</p></div>')
    }

    if (order.status !== OrderStatus.PENDING) {
        return c.html('<div style="font-family: sans-serif; text-align: center; margin-top: 50px;"><h1>Nelze zrušit</h1><p>Tuto objednávku již nelze automaticky stornovat. Pravděpodobně se již připravuje, nebo byla vyřízena. Kontaktujte nás prosím přímo.</p></div>', 400)
    }

    await c.env.DB.prepare(
        'UPDATE orders SET status = ?, status_updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(OrderStatus.CANCELED_BY_USER, id).run()

    c.executionCtx.waitUntil(
        sendCustomerCancelEmail(c.env, id, order.customer_name, order.customer_email)
    )

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
    const jwt = c.req.header('CF-Access-Jwt-Assertion')

    if (!jwt) {
        console.error('Missing CF-Access-Jwt-Assertion header. Ensure Access policy is applied to this route.');
        return c.json({ error: 'Chyba konfigurace serveru.' }, 500);
    }

    try {
        const JWKS = createRemoteJWKSet(
            new URL(`${c.env.TEAM_DOMAIN}/cdn-cgi/access/certs`),
        );

        const { payload } = await jwtVerify(jwt, JWKS, {
            issuer: c.env.TEAM_DOMAIN,
            audience: c.env.POLICY_AUD,
        });

        if (!payload.email) {
            return c.json({ error: 'Unauthorized: Token neobsahuje e-mail.' }, 403);
        }
        c.set('adminEmail', payload.email);
        await next()
    }
    catch (error) {
        console.error("JWT Validation Error:", error.message);
        return c.json({ error: 'Unauthorized: Neplatný nebo podvržený token.' }, 403)
    }
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

    if (c.env.ENVIRONMENT !== 'development') {
        return c.json({ error: 'Endpoint not available for production' }, 404);
    }

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

    if (!name || typeof name !== 'string' || name.length > 150) {
        return c.json({ error: 'Neplatný název produktu.' }, 400)
    }
    if (!price || typeof price !== 'number' || price < 0) {
        return c.json({ error: 'Neplatná cena produktu.' }, 400)
    }

    if ((description && description.length > 2000) || (sizes && sizes.length > 100)) {
        return c.json({ error: 'Překročena maximální délka textu.' }, 400)
    }

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
    const currentOrder = await c.env.DB.prepare(
        'SELECT status, customer_name, customer_email FROM orders WHERE id = ?'
    ).bind(id).first()

    if (!currentOrder) {
        return c.json({ error: 'Objednávka nenalezena.' }, 404)
    }

    if (currentOrder.status === OrderStatus.CANCELED_BY_USER || currentOrder.status === OrderStatus.CANCELED_UNCOLLECTED) {
        return c.json({ error: 'Objednávku nelze změnit, protože již byla stornována zákazníkem, nebo nevyzvednuta.' }, 409)
    }

    await c.env.DB.prepare('UPDATE orders SET status = ?, status_updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(status, id).run()
    await logAction(c.env.DB, adminEmail, 'STATUS_CHANGE', 'ORDER', id, { novy_status: status })

    if (status === OrderStatus.CANCELED) {
        c.executionCtx.waitUntil(
            sendAdminCancelEmail(c.env, id, currentOrder.customer_name, currentOrder.customer_email)
        )
    }

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
            // Cancel stale orders that have been ready for over a week
            const { results: staleOrders } = await env.DB.prepare(`
                SELECT id, customer_name, customer_email 
                FROM orders 
                WHERE status = ? 
                AND status_updated_at <= datetime('now', '-7 days')
            `).bind(OrderStatus.READY).all();

            if (staleOrders.length > 0) {
                const cancellationStatements = [];
                for (const order of staleOrders) {
                    // Prepare the UPDATE statement for the order
                    cancellationStatements.push(
                        env.DB.prepare(`
                            UPDATE orders 
                            SET status = ?, status_updated_at = CURRENT_TIMESTAMP 
                            WHERE id = ?
                        `).bind(OrderStatus.CANCELED_UNCOLLECTED, order.id)
                    );

                    // Prepare the INSERT statement for the audit log
                    cancellationStatements.push(
                        env.DB.prepare(`
                            INSERT INTO audit_logs (admin_email, action, entity, entity_id, details) 
                            VALUES (?, ?, ?, ?, ?)
                        `).bind('system@cron', 'AUTO_CANCEL', 'ORDER', order.id, JSON.stringify({ reason: 'Nevyzvednuto' }))
                    );

                    // Queue the email to be sent only after the transaction succeeds
                    ctx.waitUntil(sendUncollectedEmail(env, order.id, order.customer_name, order.customer_email));
                }

                await env.DB.batch(cancellationStatements);
                console.log(`[CRON] Auto-canceled ${staleOrders.length} stale orders.`);
            }

            // Delete orders older than 2 months that are in a final state
            const cleanupStatements = [
                env.DB.prepare(`
                    DELETE FROM orders 
                    WHERE status_updated_at <= datetime('now', '-2 month') 
                    AND status IN (?, ?, ?, ?)
                `).bind(
                    OrderStatus.COMPLETED,
                    OrderStatus.CANCELED,
                    OrderStatus.CANCELED_BY_USER,
                    OrderStatus.CANCELED_UNCOLLECTED
                ),
                // Delete audit logs older than 14 days
                env.DB.prepare(`
                    DELETE FROM audit_logs 
                    WHERE created_at <= datetime('now', '-14 days')
                `)
            ];

            const [ordersResult, logsResult] = await env.DB.batch(cleanupStatements);

            // Log the cleanup action
            const details = JSON.stringify({
                deleted_orders: ordersResult.results.length,
                deleted_logs: logsResult.results.length
            });

            await logAction(env.DB, 'system@cron', 'SYSTEM_CLEANUP', 'DATABASE', null, details);

            console.log(`[CRON SUCCESS] Cleanup completed. Removed: ${ordersResult.results.length} old orders, removed: ${logsResult.results.length} old logs`);

        } catch (e) {
            console.error("[CRON ERROR] Error during scheduled cleanup:", e);
        }
    }
};