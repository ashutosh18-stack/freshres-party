-- ========================================================
-- Fresher Fiesta 2026 - Database Schema & Initial Data
-- Target Database: fresher_party_db (MySQL / MariaDB in XAMPP)
-- ========================================================

CREATE DATABASE IF NOT EXISTS `fresher_party_db` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `fresher_party_db`;

-- --------------------------------------------------------
-- 1. Table structure for table `users`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'volunteer') DEFAULT 'volunteer',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 2. Table structure for table `students`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `students` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `roll_no` VARCHAR(50) NOT NULL UNIQUE,
  `prn_no` VARCHAR(50) NOT NULL UNIQUE,
  `department` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `division` VARCHAR(50) NULL,
  `class` VARCHAR(100) NULL,
  `transaction_id` VARCHAR(100) NULL,
  `qr_token` VARCHAR(100) NOT NULL UNIQUE,
  `qr_code_image` MEDIUMTEXT NULL,
  `mail_status` ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
  `mail_sent_at` DATETIME NULL,
  `entry_status` ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
  `verified_at` DATETIME NULL,
  `verified_by_id` INT NULL,
  `rejection_reason` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_roll` (`roll_no`),
  INDEX `idx_prn` (`prn_no`),
  INDEX `idx_token` (`qr_token`),
  INDEX `idx_entry` (`entry_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 3. Table structure for table `scan_logs`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `scan_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `student_id` INT NOT NULL,
  `scanned_by_id` INT NOT NULL,
  `action` ENUM('accepted', 'rejected', 'duplicate_attempt') NOT NULL,
  `notes` VARCHAR(255) NULL,
  `scanned_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`scanned_by_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 4. Table structure for table `system_settings`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `system_settings` (
  `key_name` VARCHAR(60) PRIMARY KEY,
  `key_value` LONGTEXT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 5. Seed Initial Admin & Volunteer Accounts
-- Passwords:
-- Admin: admin123 ($2a$10$v44w81xM1d61K8PjFfGkOej4R3W4/n6qGsq1D0t9o8n1J0i8W3Ure or bcrypt)
-- Volunteer: volunteer123
-- --------------------------------------------------------
INSERT IGNORE INTO `users` (`id`, `name`, `email`, `password_hash`, `role`) VALUES
(1, 'Super Admin', 'admin@fresher.party', '$2a$10$Upmk63j/eD65hF1b0d238uQdJ6XkG7c.HlK7E3eFp9wN5i1n4z17m', 'admin'),
(2, 'Gate Volunteer 1', 'volunteer@fresher.party', '$2a$10$V01qY2rG.ZpYv2uX9a4Y8.h0bZf/X0sB1k6QcWf2R9iUqT4wL9Oxe', 'volunteer');

-- --------------------------------------------------------
-- 6. Seed System Settings
-- --------------------------------------------------------
INSERT IGNORE INTO `system_settings` (`key_name`, `key_value`) VALUES
('event_name', 'Fresher Fiesta 2026'),
('event_venue', 'Grand University Auditorium'),
('event_date', 'November 15, 2026 at 5:00 PM'),
('smtp_host', 'smtp.gmail.com'),
('smtp_port', '587'),
('smtp_secure', 'false'),
('smtp_user', ''),
('smtp_pass', ''),
('smtp_from', '"Fresher Fiesta 2026" <noreply@fresherfiesta.com>'),
('email_subject', '🎟️ Your VIP Fresher Party Entry Pass is Here!');

