-- ============================================
-- LOGIN MICROSERVICE - DATABASE SCHEMA
-- MySQL CREATE TABLE Scripts
-- ============================================

-- Veritabanı oluştur
CREATE DATABASE IF NOT EXISTS login_microservice;
USE login_microservice;

-- ============================================
-- 1. USERS TABLOSU
-- ============================================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_email (email),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. ROLES TABLOSU
-- ============================================
CREATE TABLE roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Varsayılan roller
INSERT INTO roles (name, description) VALUES
('ADMIN', 'Sistem yöneticisi - tam yetki'),
('SELLER', 'Satıcı - ürün yönetimi yetkisi'),
('CUSTOMER', 'Müşteri - alışveriş yetkisi');

-- ============================================
-- 3. USER_ROLES TABLOSU (Many-to-Many)
-- ============================================
CREATE TABLE user_roles (
    user_id INT NOT NULL,
    role_id INT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (user_id, role_id),
    
    CONSTRAINT fk_user_roles_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    
    CONSTRAINT fk_user_roles_role
        FOREIGN KEY (role_id) REFERENCES roles(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 4. SELLER_APPLICATIONS TABLOSU
-- Satıcı başvuruları için
-- ============================================
CREATE TABLE seller_applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    store_name VARCHAR(255) NOT NULL,
    tax_number VARCHAR(50) NOT NULL,
    status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
    rejection_reason VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    reviewed_by INT NULL,
    
    CONSTRAINT fk_seller_app_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    
    CONSTRAINT fk_seller_app_reviewer
        FOREIGN KEY (reviewed_by) REFERENCES users(id)
        ON DELETE SET NULL,
    
    INDEX idx_status (status),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ÖRNEK ADMIN KULLANICISI (opsiyonel)
-- Password: admin123 (bcrypt hash)
-- ============================================
-- INSERT INTO users (email, password_hash, first_name, last_name) VALUES
-- ('admin@marketplace.com', '$2b$10$...hash...', 'Admin', 'User');

-- INSERT INTO user_roles (user_id, role_id) VALUES
-- (1, 1); -- Admin rolü
