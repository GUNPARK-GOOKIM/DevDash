import sqlite3
import os

db_path = os.path.join(os.getcwd(), 'devdash_test.db')
if os.path.exists(db_path):
    os.remove(db_path)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Table 1: users
cursor.execute('''
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'developer',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
''')

cursor.executemany('''
INSERT INTO users (username, email, role, status) VALUES (?, ?, ?, ?)
''', [
    ('alice_dev', 'alice@devdash.io', 'admin', 'active'),
    ('bob_lead', 'bob@devdash.io', 'lead_engineer', 'active'),
    ('charlie_qa', 'charlie@devdash.io', 'qa_engineer', 'active'),
    ('david_pm', 'david@devdash.io', 'product_manager', 'inactive'),
    ('eva_security', 'eva@devdash.io', 'security_auditor', 'active'),
])

# Table 2: categories
cursor.execute('''
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT
)
''')

cursor.executemany('''
INSERT INTO categories (name, description) VALUES (?, ?)
''', [
    ('Developer Tools', 'Desktop IDEs, database clients, and CLI utilities'),
    ('Cloud Infrastructure', 'Servers, databases, and container registries'),
    ('Security & Compliance', 'Keyrings, audit loggers, and scanner tools'),
])

# Table 3: products
cursor.execute('''
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER DEFAULT 100,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY(category_id) REFERENCES categories(id)
)
''')

cursor.executemany('''
INSERT INTO products (category_id, name, price, stock, is_active) VALUES (?, ?, ?, ?, ?)
''', [
    (1, 'DevDash Pro Desktop License', 49.99, 500, 1),
    (1, 'DevDash Enterprise Server', 299.99, 50, 1),
    (2, 'Postgres High-Availability Cluster', 120.00, 20, 1),
    (2, 'Redis In-Memory Cache Node', 35.50, 100, 1),
    (3, 'SOC2 Compliance Audit Reporter', 89.00, 150, 1),
])

# Table 4: orders
cursor.execute('''
CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    total_amount REAL NOT NULL,
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
)
''')

cursor.executemany('''
INSERT INTO orders (user_id, product_id, quantity, total_amount) VALUES (?, ?, ?, ?)
''', [
    (1, 1, 2, 99.98),
    (2, 2, 1, 299.99),
    (3, 4, 3, 106.50),
    (4, 5, 1, 89.00),
    (5, 3, 2, 240.00),
])

conn.commit()
conn.close()

print(f"[SUCCESS] SQLite Test Database created at: {db_path}")
