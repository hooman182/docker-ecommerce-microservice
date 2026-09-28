-- =============================================================
-- Ecommerce Platform - MySQL Schema (Pardis Cloud Phase 1, RDS-ready)
-- Applies to: local docker-compose (auto-run on first init) or RDS MySQL 8.0+
-- Manual application against RDS:
--   mysql -h <RDS_ENDPOINT> -P 3306 -u <DB_USER> -p < db/init.sql
-- =============================================================

CREATE DATABASE IF NOT EXISTS ecommerce
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ecommerce;

-- -------------------------------------------------------------
-- User accounts and profiles (profile-management)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name   VARCHAR(100)  NOT NULL,
  last_name    VARCHAR(100)  NOT NULL,
  address      VARCHAR(255)  NOT NULL,
  postal_code  VARCHAR(20)   NOT NULL,
  email        VARCHAR(255)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------
-- Product catalog (product-catalog)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(255)  NOT NULL,
  description VARCHAR(500)  NOT NULL,
  price       DECIMAL(10,2) NOT NULL,
  category    VARCHAR(100)  NOT NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------
-- Inventory management (product-inventory)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory (
  product_id BIGINT UNSIGNED NOT NULL,
  quantity   INT       NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id),
  CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------
-- Shopping carts (order-management)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cart_items (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  product_id  BIGINT UNSIGNED NOT NULL,
  quantity    INT           NOT NULL DEFAULT 1,
  name        VARCHAR(255)  NOT NULL,
  description VARCHAR(500)  NOT NULL,
  price       DECIMAL(10,2) NOT NULL,
  category    VARCHAR(100)  NOT NULL,
  added_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cart_user_product (user_id, product_id),
  CONSTRAINT fk_cart_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------
-- Order transactions (order-management, for completed purchases)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  subtotal   DECIMAL(10,2) NOT NULL,
  shipping   DECIMAL(10,2) NOT NULL,
  total      DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_orders_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_items (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id   BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity   INT           NOT NULL,
  price      DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order   FOREIGN KEY (order_id)   REFERENCES orders (id),
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------
-- Seed data (matches the former in-memory defaults)
-- Runs once, when the data directory is first initialized
-- -------------------------------------------------------------
INSERT INTO products (id, name, description, price, category) VALUES
  (1,  'Wireless Bluetooth Headphones', 'High-quality sound and comfortable fit',                     59.99,  'Electronics'),
  (2,  'Vintage Leather Backpack',      'Stylish and durable backpack for everyday use',              89.99,  'Accessories'),
  (3,  'Stainless Steel Water Bottle',  'Eco-friendly and leak-proof water bottle',                   19.99,  'Home & Kitchen'),
  (4,  'Organic Green Tea',             'A refreshing and healthy organic green tea',                 15.99,  'Groceries'),
  (5,  'Smartwatch Fitness Tracker',    'Track your fitness and stay connected on the go',            199.99, 'Electronics'),
  (6,  'Professional Studio Microphone','Record high-quality audio with this studio microphone',      129.99, 'Electronics'),
  (7,  'Ergonomic Office Chair',        'Stay comfortable while working with this ergonomic chair',   249.99, 'Office Supplies'),
  (8,  'LED Desk Lamp',                 'Brighten your workspace with this energy-efficient LED lamp',39.99,  'Home & Kitchen'),
  (9,  'Gourmet Chocolate Box',         'Indulge in a variety of gourmet chocolates',                 29.99,  'Groceries'),
  (10, 'Yoga Mat with Carrying Strap',  'A non-slip yoga mat perfect for all types of yoga',          49.99,  'Fitness'),
  (11, 'Insulated Camping Tent',        'A durable and insulated tent for your outdoor adventures',   349.99, 'Outdoor'),
  (12, 'Bluetooth Speaker',             'Portable speaker with exceptional sound quality',            99.99,  'Electronics');

INSERT INTO inventory (product_id, quantity) VALUES
  (1, 100), (2, 50),  (3, 75),  (4, 120), (5, 30),  (6, 60),
  (7, 40),  (8, 90),  (9, 80),  (10, 70), (11, 20), (12, 55);
