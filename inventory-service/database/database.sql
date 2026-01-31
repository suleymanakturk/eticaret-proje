-- =============================================
-- INVENTORY SERVICE DATABASE SCHEMA
-- Stok yönetimi ve rezervasyon sistemi
-- =============================================

-- Veritabanını oluştur
CREATE DATABASE IF NOT EXISTS inventory_service_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE inventory_service_db;

-- Kullanıcı oluştur ve yetki ver
CREATE USER IF NOT EXISTS 'inventory_service_user'@'%' IDENTIFIED BY 'inventory_service_password';
GRANT ALL PRIVILEGES ON inventory_service_db.* TO 'inventory_service_user'@'%';
FLUSH PRIVILEGES;

-- =============================================
-- STOCKS TABLOSU
-- Ürün stok bilgileri
-- =============================================
CREATE TABLE IF NOT EXISTS stocks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- Ürün bilgisi (MongoDB ObjectId ile eşleşir)
    product_id VARCHAR(50) NOT NULL UNIQUE,
    
    -- Stok miktarları
    quantity INT NOT NULL DEFAULT 0,           -- Mevcut toplam stok
    reserved_quantity INT NOT NULL DEFAULT 0,  -- Rezerve edilmiş miktar
    
    -- Zaman damgaları
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- İndeksler
    INDEX idx_product_id (product_id),
    
    -- Kısıtlamalar
    CONSTRAINT chk_quantity_positive CHECK (quantity >= 0),
    CONSTRAINT chk_reserved_positive CHECK (reserved_quantity >= 0),
    CONSTRAINT chk_reserved_not_exceed CHECK (reserved_quantity <= quantity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- STOCK_TRANSACTIONS TABLOSU
-- Stok hareketleri log'u
-- =============================================
CREATE TABLE IF NOT EXISTS stock_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- İlişki
    product_id VARCHAR(50) NOT NULL,
    
    -- İşlem detayları
    transaction_type ENUM('RESERVE', 'CONFIRM', 'RELEASE', 'ADD', 'REMOVE', 'INIT') NOT NULL,
    quantity_change INT NOT NULL,  -- Pozitif veya negatif
    
    -- Durum
    previous_quantity INT NOT NULL,
    previous_reserved INT NOT NULL,
    new_quantity INT NOT NULL,
    new_reserved INT NOT NULL,
    
    -- İlişkili sipariş (varsa)
    order_id INT NULL,
    
    -- İşlemi yapan (varsa)
    user_id INT NULL,
    
    -- Notlar
    notes TEXT NULL,
    
    -- Zaman
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- İndeksler
    INDEX idx_product_id (product_id),
    INDEX idx_transaction_type (transaction_type),
    INDEX idx_order_id (order_id),
    INDEX idx_created_at (created_at),
    
    -- Foreign key (opsiyonel - stocks tablosuna)
    FOREIGN KEY (product_id) REFERENCES stocks(product_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- ÖRNEK VERİ (Test için)
-- =============================================
-- INSERT INTO stocks (product_id, quantity, reserved_quantity) VALUES
-- ('product_001', 100, 0),
-- ('product_002', 50, 5),
-- ('product_003', 25, 0);

SELECT 'Inventory Service veritabanı başarıyla oluşturuldu!' AS message;
