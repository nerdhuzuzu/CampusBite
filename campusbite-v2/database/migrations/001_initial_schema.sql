-- =============================================================================
-- CampusBite V2 — Normalized Relational MySQL Schema (campusbite_v2)
-- Clean Database Architecture: Zero Demo Establishments, Zero Fake Records
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  role_id INT NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(191) UNIQUE NULL,
  phone VARCHAR(30) UNIQUE NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  phone_verified TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('ACTIVE', 'SUSPENDED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  wallet_balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
  INDEX idx_users_role (role_id),
  INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  refresh_token_hash VARCHAR(255) NOT NULL,
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(64) NULL,
  expires_at DATETIME NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS otp_verifications (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NULL,
  target VARCHAR(191) NOT NULL,
  email VARCHAR(191) NULL,
  phone VARCHAR(30) NULL,
  channel ENUM('EMAIL', 'SMS') NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  purpose ENUM('SIGNUP', 'RESET_PASSWORD', 'LOGIN') NOT NULL DEFAULT 'SIGNUP',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  verified TINYINT(1) NOT NULL DEFAULT 0,
  verified_at DATETIME NULL,
  invalidated TINYINT(1) NOT NULL DEFAULT 0,
  provider_name VARCHAR(60) NULL,
  provider_ref_id VARCHAR(191) NULL,
  delivery_status VARCHAR(80) NOT NULL DEFAULT 'PENDING',
  failure_category VARCHAR(120) NULL,
  expires_at DATETIME NOT NULL,
  last_sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_target_purpose (target, purpose),
  INDEX idx_otp_email (email),
  INDEX idx_otp_phone (phone),
  INDEX idx_otp_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS canteens (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  type ENUM('CANTEEN', 'CAFE', 'FOOD_STALL', 'RESTAURANT') NOT NULL DEFAULT 'CANTEEN',
  description TEXT NULL,
  logo_url VARCHAR(500) NULL,
  cover_image_url VARCHAR(500) NULL,
  contact_email VARCHAR(191) NULL,
  contact_phone VARCHAR(40) NULL,
  location VARCHAR(255) NULL,
  opening_time VARCHAR(10) NOT NULL DEFAULT '08:00',
  closing_time VARCHAR(10) NOT NULL DEFAULT '20:00',
  status ENUM('ACTIVE', 'SUSPENDED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  qr_token VARCHAR(128) NOT NULL UNIQUE,
  crowd_count INT NOT NULL DEFAULT 0,
  crowd_level ENUM('LOW', 'MEDIUM', 'HIGH') NOT NULL DEFAULT 'LOW',
  crowd_updated_at DATETIME NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_canteens_status (status, is_deleted),
  INDEX idx_canteens_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS canteen_managers (
  id CHAR(36) PRIMARY KEY,
  canteen_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL UNIQUE,
  assigned_by CHAR(36) NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cm_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(id) ON DELETE CASCADE,
  CONSTRAINT fk_cm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_cm_canteen (canteen_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_categories (
  id CHAR(36) PRIMARY KEY,
  canteen_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(300) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mcat_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(id) ON DELETE CASCADE,
  UNIQUE KEY uq_canteen_category (canteen_id, name),
  INDEX idx_mcat_canteen (canteen_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_items (
  id CHAR(36) PRIMARY KEY,
  canteen_id CHAR(36) NOT NULL,
  category_id CHAR(36) NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT NULL,
  price DECIMAL(10, 2) NOT NULL,
  dietary_type ENUM('VEG', 'NON_VEG', 'VEGAN', 'EGG') NOT NULL DEFAULT 'VEG',
  preparation_time INT NOT NULL DEFAULT 10,
  stock_quantity INT NOT NULL DEFAULT 50,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  image_url VARCHAR(500) NULL,
  total_orders INT NOT NULL DEFAULT 0,
  avg_rating DECIMAL(3, 2) NOT NULL DEFAULT 0.00,
  total_reviews INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mitem_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(id) ON DELETE CASCADE,
  CONSTRAINT fk_mitem_category FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE SET NULL,
  INDEX idx_mitem_canteen (canteen_id, is_deleted, is_available),
  INDEX idx_mitem_dietary (dietary_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_images (
  id CHAR(36) PRIMARY KEY,
  menu_item_id CHAR(36) NULL,
  canteen_id CHAR(36) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  public_url VARCHAR(500) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  size_bytes INT NOT NULL,
  image_data LONGBLOB NULL,
  storage_provider VARCHAR(40) NOT NULL DEFAULT 'MYSQL_BLOB',
  uploaded_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mimg_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_mimg_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(id) ON DELETE CASCADE,
  CONSTRAINT fk_mimg_user FOREIGN KEY (uploaded_by) REFERENCES users(id),
  INDEX idx_mimg_canteen (canteen_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory (
  id CHAR(36) PRIMARY KEY,
  canteen_id CHAR(36) NOT NULL,
  item_name VARCHAR(160) NOT NULL,
  unit VARCHAR(30) NOT NULL DEFAULT 'units',
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  min_threshold DECIMAL(10, 2) NOT NULL DEFAULT 5.00,
  unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inv_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(id) ON DELETE CASCADE,
  UNIQUE KEY uq_inv_canteen_item (canteen_id, item_name),
  INDEX idx_inv_canteen (canteen_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id CHAR(36) PRIMARY KEY,
  inventory_id CHAR(36) NOT NULL,
  canteen_id CHAR(36) NOT NULL,
  movement_type ENUM('PURCHASE', 'CONSUMPTION', 'WASTAGE', 'ADJUSTMENT') NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  reason VARCHAR(300) NULL,
  performed_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_invm_inv FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
  CONSTRAINT fk_invm_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(id) ON DELETE CASCADE,
  INDEX idx_invm_canteen (canteen_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS addresses (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  label VARCHAR(80) NOT NULL,
  building_or_block VARCHAR(160) NOT NULL,
  room_or_landmark VARCHAR(160) NULL,
  notes VARCHAR(255) NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_addr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_addr_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) PRIMARY KEY,
  order_number VARCHAR(40) NOT NULL UNIQUE,
  customer_id CHAR(36) NOT NULL,
  canteen_id CHAR(36) NOT NULL,
  canteen_name_snapshot VARCHAR(160) NOT NULL,
  status ENUM('PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PLACED',
  subtotal DECIMAL(10, 2) NOT NULL,
  tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(10, 2) NOT NULL,
  payment_method ENUM('CASH', 'RAZORPAY', 'WALLET') NOT NULL DEFAULT 'CASH',
  payment_status ENUM('PENDING', 'PAID', 'REFUNDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  delivery_address_snapshot VARCHAR(500) NULL,
  special_instructions VARCHAR(500) NULL,
  rejection_reason VARCHAR(300) NULL,
  idempotency_key VARCHAR(128) UNIQUE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES users(id),
  CONSTRAINT fk_orders_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(id),
  INDEX idx_orders_customer (customer_id, created_at),
  INDEX idx_orders_canteen (canteen_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  menu_item_id CHAR(36) NOT NULL,
  item_name_snapshot VARCHAR(160) NOT NULL,
  unit_price_snapshot DECIMAL(10, 2) NOT NULL,
  quantity INT NOT NULL,
  line_total DECIMAL(10, 2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_oitems_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_oitems_mitem FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
  INDEX idx_oitems_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NULL,
  user_id CHAR(36) NOT NULL,
  canteen_id CHAR(36) NULL,
  canteen_name_snapshot VARCHAR(160) NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  method ENUM('CASH', 'RAZORPAY', 'WALLET') NOT NULL,
  status ENUM('PENDING', 'CAPTURED', 'REFUNDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  gateway_order_id VARCHAR(128) NULL,
  gateway_payment_id VARCHAR(128) NULL,
  gateway_signature VARCHAR(255) NULL,
  transaction_ref VARCHAR(128) NOT NULL UNIQUE,
  idempotency_key VARCHAR(128) UNIQUE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_pay_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_pay_user (user_id, created_at),
  INDEX idx_pay_canteen (canteen_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reviews (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NULL,
  customer_id CHAR(36) NOT NULL,
  canteen_id CHAR(36) NOT NULL,
  menu_item_id CHAR(36) NOT NULL,
  rating INT NOT NULL,
  comment VARCHAR(600) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rev_customer FOREIGN KEY (customer_id) REFERENCES users(id),
  CONSTRAINT fk_rev_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(id),
  CONSTRAINT fk_rev_mitem FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
  INDEX idx_rev_mitem (menu_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message VARCHAR(500) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'ORDER_UPDATE',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id, is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(36) PRIMARY KEY,
  actor_id CHAR(36) NULL,
  actor_role VARCHAR(40) NULL,
  canteen_id CHAR(36) NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(64) NULL,
  action VARCHAR(80) NOT NULL,
  previous_name VARCHAR(160) NULL,
  new_name VARCHAR(160) NULL,
  metadata JSON NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_canteen (canteen_id, created_at),
  INDEX idx_audit_action (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  entry_type ENUM('CREDIT', 'DEBIT', 'REFUND') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  balance_after DECIMAL(10, 2) NOT NULL,
  reference_id VARCHAR(128) NOT NULL,
  description VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_wallet_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_budgets (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  month_year CHAR(7) NOT NULL,
  monthly_limit DECIMAL(10, 2) NOT NULL DEFAULT 3000.00,
  alert_threshold_pct INT NOT NULL DEFAULT 75,
  restrict_spending TINYINT(1) NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cbudget_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_month_budget (user_id, month_year),
  INDEX idx_cbudget_user (user_id, month_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_preferences (
  user_id CHAR(36) PRIMARY KEY,
  dietary_type ENUM('VEG', 'NON_VEG', 'VEGAN', 'EGG') NOT NULL DEFAULT 'VEG',
  spice_level INT NOT NULL DEFAULT 3,
  allergies VARCHAR(500) NULL,
  default_monthly_budget DECIMAL(10, 2) NOT NULL DEFAULT 3000.00,
  default_alert_threshold_pct INT NOT NULL DEFAULT 75,
  restrict_spending TINYINT(1) NOT NULL DEFAULT 0,
  budget_enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cpref_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed ONLY immutable system roles (NO demo establishments, NO demo food items)
INSERT IGNORE INTO roles (id, name, description) VALUES
  (1, 'CUSTOMER', 'Campus food platform customer'),
  (2, 'MANAGER', 'Assigned canteen or restaurant manager'),
  (3, 'ADMIN', 'Platform administrator');

SET FOREIGN_KEY_CHECKS = 1;
