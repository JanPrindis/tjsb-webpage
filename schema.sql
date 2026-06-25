DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS audit_logs;

CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    description TEXT,
    image_url TEXT,
    gallery_urls TEXT,
    sizes TEXT
);

CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    created_at DATETIME default CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    size TEXT,
    quantity INTEGER NOT NULL,
    price INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id INTEGER,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Testovací data
INSERT INTO products (name, price, description, image_url, gallery_urls, sizes) VALUES
('Výroční Tričko Sokol', 450, 'Limitovaná bavlněná edice.', '/tricko.jpg', NULL, 'S, M, L, XL, XXL'),
('Zimní Kulich', 300, 'Teplá čepice s bambulí.', '/kulich.jpg', NULL, NULL);

-- ==========================================
-- ZKUŠEBNÍ DATA
-- ==========================================
INSERT INTO products (name, price, description, image_url, sizes) VALUES
('Výroční Tričko Sokol', 450, 'Limitovaná bavlněná edice.', '/tricko.jpg', 'S, M, L, XL, XXL'),
('Zimní Kulich', 300, 'Teplá čepice s bambulí.', '/kulich.jpg', NULL);

-- Objednávka 1 (Nová)
INSERT INTO orders (customer_name, customer_email, customer_phone, status)
VALUES ('Pepa Z Depa', 'pepa@seznam.cz', '+420123456789', 'PENDING');
INSERT INTO order_items (order_id, product_id, product_name, size, quantity, price)
VALUES (1, 1, 'Výroční Tričko Sokol', 'XL', 1, 450);

-- Objednávka 2 (Dokončená)
INSERT INTO orders (customer_name, customer_email, customer_phone, status)
VALUES ('Karel Kryl', 'kaja@email.cz', '+420111222333', 'COMPLETED');
INSERT INTO order_items (order_id, product_id, product_name, size, quantity, price)
VALUES (2, 2, 'Zimní Kulich', NULL, 2, 300);