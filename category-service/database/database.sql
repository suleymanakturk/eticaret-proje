-- ============================================
-- CATEGORY SERVICE - DATABASE SCHEMA
-- Hierarchical: Category → Product Type → Brand
-- ============================================

CREATE DATABASE IF NOT EXISTS category_service_db;
USE category_service_db;

-- ============================================
-- 1. CATEGORIES (Ana Kategori)
-- ============================================
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255),
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. PRODUCT_TYPES (Ürün Türü)
-- ============================================
CREATE TABLE product_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_category_type (category_id, name),
    
    CONSTRAINT fk_type_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON DELETE CASCADE,
    
    INDEX idx_category_id (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. BRANDS (Marka)
-- ============================================
CREATE TABLE brands (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_type_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    logo_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_type_brand (product_type_id, name),
    
    CONSTRAINT fk_brand_type
        FOREIGN KEY (product_type_id) REFERENCES product_types(id)
        ON DELETE CASCADE,
    
    INDEX idx_product_type_id (product_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ÖRNEK VERİLER
-- ============================================

-- Kategoriler
INSERT INTO categories (name, description, icon) VALUES
('Elektronik', 'Elektronik cihazlar ve aksesuarlar', '📱'),
('Giyim', 'Erkek, kadın ve çocuk giyim', '👕'),
('Ev & Yaşam', 'Ev dekorasyon ve yaşam ürünleri', '🏠');

-- Ürün Türleri
INSERT INTO product_types (category_id, name, description) VALUES
-- Elektronik
(1, 'Telefon', 'Akıllı telefonlar'),
(1, 'Bilgisayar', 'Laptop ve masaüstü bilgisayarlar'),
(1, 'Tablet', 'Tabletler ve e-okuyucular'),
-- Giyim
(2, 'Tişört', 'Erkek ve kadın tişörtler'),
(2, 'Pantolon', 'Kot ve kumaş pantolonlar'),
(2, 'Ayakkabı', 'Spor ve günlük ayakkabılar'),
-- Ev & Yaşam
(3, 'Mobilya', 'Koltuk, masa, sandalye'),
(3, 'Dekorasyon', 'Ev dekorasyon ürünleri'),
(3, 'Aydınlatma', 'Lamba ve aydınlatma ürünleri');

-- Markalar
INSERT INTO brands (product_type_id, name) VALUES
-- Telefon markaları
(1, 'Samsung'),
(1, 'Apple'),
(1, 'Xiaomi'),
(1, 'Huawei'),
-- Bilgisayar markaları
(2, 'Apple'),
(2, 'Lenovo'),
(2, 'HP'),
(2, 'Dell'),
(2, 'Asus'),
-- Tablet markaları
(3, 'Apple'),
(3, 'Samsung'),
(3, 'Lenovo'),
-- Tişört markaları
(4, 'Nike'),
(4, 'Adidas'),
(4, 'Puma'),
-- Pantolon markaları
(5, 'Levi''s'),
(5, 'Mavi'),
(5, 'LCW'),
-- Ayakkabı markaları
(6, 'Nike'),
(6, 'Adidas'),
(6, 'New Balance'),
-- Mobilya markaları
(7, 'IKEA'),
(7, 'Bellona'),
(7, 'İstikbal'),
-- Dekorasyon markaları
(8, 'Madame Coco'),
(8, 'English Home'),
-- Aydınlatma markaları
(9, 'Philips'),
(9, 'IKEA');
