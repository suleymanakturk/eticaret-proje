-- =============================================
-- PAYMENT SERVICE DATABASE SCHEMA
-- Ödeme işleme sistemi
-- =============================================

CREATE DATABASE IF NOT EXISTS payment_service_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE payment_service_db;

-- Kullanıcı oluştur
CREATE USER IF NOT EXISTS 'payment_service_user'@'%' IDENTIFIED BY 'payment_service_password';
GRANT ALL PRIVILEGES ON payment_service_db.* TO 'payment_service_user'@'%';
FLUSH PRIVILEGES;

-- =============================================
-- PAYMENTS TABLOSU
-- Ödeme işlem kayıtları
-- =============================================
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- İşlem bilgileri
    transaction_id VARCHAR(100) NOT NULL UNIQUE,
    order_id INT NOT NULL,
    user_id INT NOT NULL,
    
    -- Tutar bilgisi
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'TRY',
    
    -- Durum
    status ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'CANCELLED') DEFAULT 'PENDING',
    
    -- Ödeme detayları (hassas veri YOK - sadece maskelenmiş)
    payment_method VARCHAR(50) DEFAULT 'CARD',
    card_last_four VARCHAR(4) NULL,  -- Sadece son 4 hane
    
    -- Hata bilgisi (başarısız ise)
    error_code VARCHAR(50) NULL,
    error_message TEXT NULL,
    
    -- Callback durumu
    order_callback_sent BOOLEAN DEFAULT FALSE,
    inventory_callback_sent BOOLEAN DEFAULT FALSE,
    
    -- Zaman damgaları
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- İndeksler
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_order_id (order_id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- REFUNDS TABLOSU
-- İade kayıtları
-- =============================================
CREATE TABLE IF NOT EXISTS refunds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- İlişki
    payment_id INT NOT NULL,
    refund_transaction_id VARCHAR(100) NOT NULL UNIQUE,
    
    -- Tutar
    amount DECIMAL(10, 2) NOT NULL,
    
    -- Durum
    status ENUM('PENDING', 'SUCCESS', 'FAILED') DEFAULT 'PENDING',
    reason TEXT NULL,
    
    -- Zaman
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Payment Service veritabanı başarıyla oluşturuldu!' AS message;
