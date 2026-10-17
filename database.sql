-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 05, 2026 at 05:44 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `pacfas_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `attorney`
--

DROP TABLE IF EXISTS `attorney`;
CREATE TABLE IF NOT EXISTS `attorney` (
  `attorney_id` char(5) NOT NULL,
  `user_id` int(11) NOT NULL,
  `fname` varchar(30) NOT NULL,
  `lname` varchar(30) NOT NULL,
  `specialization_id` int(11) DEFAULT NULL,
  `bar_number` varchar(30) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`attorney_id`),
  KEY `fk_attorney_user` (`user_id`),
  KEY `fk_attorney_specialization` (`specialization_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `case_attorney`
--

DROP TABLE IF EXISTS `case_attorney`;
CREATE TABLE IF NOT EXISTS `case_attorney` (
  `case_attorney_id` int(11) NOT NULL AUTO_INCREMENT,
  `cf_code` int(11) NOT NULL,
  `attorney_id` char(5) NOT NULL,
  `role_on_case` varchar(20) DEFAULT NULL,
  `assigned_date` date DEFAULT NULL,
  PRIMARY KEY (`case_attorney_id`),
  KEY `fk_ca_case` (`cf_code`),
  KEY `fk_ca_attorney` (`attorney_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `case_category`
--

DROP TABLE IF EXISTS `case_category`;
CREATE TABLE IF NOT EXISTS `case_category` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(20) NOT NULL,
  `label` varchar(50) NOT NULL,
  `sort_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `case_file`
--

DROP TABLE IF EXISTS `case_file`;
CREATE TABLE IF NOT EXISTS `case_file` (
  `cf_code` int(11) NOT NULL AUTO_INCREMENT,
  `cf_name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `category_id` int(11) DEFAULT NULL,
  `status_id` int(11) NOT NULL,
  `priority_id` int(11) DEFAULT NULL,
  `filing_date` date DEFAULT NULL,
  `creation_date` date NOT NULL,
  `last_updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `is_visible` tinyint(4) NOT NULL DEFAULT 0,
  `created_by` int(11) DEFAULT NULL,
  `is_deleted` tinyint(4) NOT NULL DEFAULT 0,
  PRIMARY KEY (`cf_code`),
  KEY `fk_cf_category` (`category_id`),
  KEY `fk_cf_status` (`status_id`),
  KEY `fk_cf_priority` (`priority_id`),
  KEY `fk_cf_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `case_priority`
--

DROP TABLE IF EXISTS `case_priority`;
CREATE TABLE IF NOT EXISTS `case_priority` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `label` varchar(255) NOT NULL,
  `sort_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `case_status`
--

DROP TABLE IF EXISTS `case_status`;
CREATE TABLE IF NOT EXISTS `case_status` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `label` varchar(255) NOT NULL,
  `sort_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `client`
--

DROP TABLE IF EXISTS `client`;
CREATE TABLE IF NOT EXISTS `client` (
  `client_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `fname` varchar(30) NOT NULL,
  `mname` varchar(50) DEFAULT NULL,
  `lname` varchar(30) NOT NULL,
  `birth_date` date NOT NULL,
  `gender` varchar(20) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `contact_number` varchar(20) DEFAULT NULL,
  `purok` varchar(20) DEFAULT NULL,
  `barangay` varchar(50) DEFAULT NULL,
  `city` varchar(30) DEFAULT NULL,
  `region` varchar(30) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`client_id`),
  KEY `fk_client_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `client_case`
--

DROP TABLE IF EXISTS `client_case`;
CREATE TABLE IF NOT EXISTS `client_case` (
  `client_case_id` int(11) NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `cf_code` int(11) NOT NULL,
  `client_role` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`client_case_id`),
  KEY `fk_cc_client` (`client_id`),
  KEY `fk_cc_case` (`cf_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `document`
--

DROP TABLE IF EXISTS `document`;
CREATE TABLE IF NOT EXISTS `document` (
  `document_code` int(11) NOT NULL AUTO_INCREMENT,
  `cf_code` int(11) NOT NULL,
  `doc_name` varchar(150) NOT NULL,
  `file_type` varchar(100) DEFAULT NULL,
  `file_path` varchar(255) NOT NULL,
  `status_id` int(11) DEFAULT NULL,
  `current_version_no` int(11) NOT NULL DEFAULT 1,
  `uploaded_by` int(11) NOT NULL,
  `date_added` date NOT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `is_deleted` tinyint(4) NOT NULL DEFAULT 0,
  PRIMARY KEY (`document_code`),
  KEY `fk_doc_case` (`cf_code`),
  KEY `fk_doc_status` (`status_id`),
  KEY `fk_doc_uploaded_by` (`uploaded_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `document_status`
--

DROP TABLE IF EXISTS `document_status`;
CREATE TABLE IF NOT EXISTS `document_status` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `label` varchar(255) NOT NULL,
  `sort_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `document_version`
--

DROP TABLE IF EXISTS `document_version`;
CREATE TABLE IF NOT EXISTS `document_version` (
  `version_id` int(11) NOT NULL AUTO_INCREMENT,
  `document_code` int(11) NOT NULL,
  `version_no` int(11) NOT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `file_path` varchar(255) NOT NULL,
  `file_size` int(11) DEFAULT NULL,
  `mime_type` varchar(100) DEFAULT NULL,
  `extracted_text` longtext DEFAULT NULL,
  `ocr_status` enum('PENDING','PROCESSING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  `ocr_error` varchar(255) DEFAULT NULL,
  `uploaded_by` int(11) NOT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`version_id`),
  UNIQUE KEY `uq_document_version` (`document_code`, `version_no`),
  KEY `fk_dv_document` (`document_code`),
  KEY `fk_dv_uploaded_by` (`uploaded_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `hearing_schedule`
--

DROP TABLE IF EXISTS `hearing_schedule`;
CREATE TABLE IF NOT EXISTS `hearing_schedule` (
  `hearing_id` int(11) NOT NULL AUTO_INCREMENT,
  `cf_code` int(11) NOT NULL,
  `hearing_date` datetime NOT NULL,
  `venue` varchar(100) DEFAULT NULL,
  `courtroom` varchar(50) DEFAULT NULL,
  `hearing_type` varchar(50) DEFAULT NULL,
  `assigned_judge` varchar(100) DEFAULT NULL,
  `status_id` int(11) DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`hearing_id`),
  KEY `fk_hs_case` (`cf_code`),
  KEY `fk_hs_status` (`status_id`),
  KEY `fk_hs_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `hearing_status`
--

DROP TABLE IF EXISTS `hearing_status`;
CREATE TABLE IF NOT EXISTS `hearing_status` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `label` varchar(255) NOT NULL,
  `sort_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `role`
--

DROP TABLE IF EXISTS `role`;
CREATE TABLE IF NOT EXISTS `role` (
  `role_id` int(11) NOT NULL AUTO_INCREMENT,
  `role_name` varchar(50) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `specialization`
--

DROP TABLE IF EXISTS `specialization`;
CREATE TABLE IF NOT EXISTS `specialization` (
  `specialization_id` int(11) NOT NULL AUTO_INCREMENT,
  `specialization_name` varchar(100) NOT NULL,
  PRIMARY KEY (`specialization_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_account`
--

DROP TABLE IF EXISTS `user_account`;
CREATE TABLE IF NOT EXISTS `user_account` (
  `user_id` int(11) NOT NULL AUTO_INCREMENT,
  `role_id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `is_active` tinyint(4) NOT NULL DEFAULT 1,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  KEY `fk_user_role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_log`
--

DROP TABLE IF EXISTS `user_log`;
CREATE TABLE IF NOT EXISTS `user_log` (
  `log_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `event_type` varchar(30) NOT NULL,
  `action_taken` varchar(100) NOT NULL,
  `target_cf_code` int(11) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `device_info` varchar(255) DEFAULT NULL,
  `timestamp` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`log_id`),
  KEY `fk_ul_user` (`user_id`),
  KEY `fk_ul_target_cf` (`target_cf_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `attorney`
--
ALTER TABLE `attorney`
  ADD CONSTRAINT `fk_attorney_specialization` FOREIGN KEY (`specialization_id`) REFERENCES `specialization` (`specialization_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_attorney_user` FOREIGN KEY (`user_id`) REFERENCES `user_account` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `case_attorney`
--
ALTER TABLE `case_attorney`
  ADD CONSTRAINT `fk_ca_attorney` FOREIGN KEY (`attorney_id`) REFERENCES `attorney` (`attorney_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_ca_case` FOREIGN KEY (`cf_code`) REFERENCES `case_file` (`cf_code`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `case_file`
--
ALTER TABLE `case_file`
  ADD CONSTRAINT `fk_cf_category` FOREIGN KEY (`category_id`) REFERENCES `case_category` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_cf_created_by` FOREIGN KEY (`created_by`) REFERENCES `user_account` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_cf_priority` FOREIGN KEY (`priority_id`) REFERENCES `case_priority` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_cf_status` FOREIGN KEY (`status_id`) REFERENCES `case_status` (`id`) ON UPDATE CASCADE;

--
-- Constraints for table `client`
--
ALTER TABLE `client`
  ADD CONSTRAINT `fk_client_user` FOREIGN KEY (`user_id`) REFERENCES `user_account` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `client_case`
--
ALTER TABLE `client_case`
  ADD CONSTRAINT `fk_cc_case` FOREIGN KEY (`cf_code`) REFERENCES `case_file` (`cf_code`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_cc_client` FOREIGN KEY (`client_id`) REFERENCES `client` (`client_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `document`
--
ALTER TABLE `document`
  ADD CONSTRAINT `fk_doc_case` FOREIGN KEY (`cf_code`) REFERENCES `case_file` (`cf_code`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_doc_status` FOREIGN KEY (`status_id`) REFERENCES `document_status` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_doc_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `user_account` (`user_id`) ON UPDATE CASCADE;

--
-- Constraints for table `document_version`
--
ALTER TABLE `document_version`
  ADD CONSTRAINT `fk_dv_document` FOREIGN KEY (`document_code`) REFERENCES `document` (`document_code`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_dv_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `user_account` (`user_id`) ON UPDATE CASCADE;

--
-- Constraints for table `hearing_schedule`
--
ALTER TABLE `hearing_schedule`
  ADD CONSTRAINT `fk_hs_case` FOREIGN KEY (`cf_code`) REFERENCES `case_file` (`cf_code`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_hs_created_by` FOREIGN KEY (`created_by`) REFERENCES `user_account` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_hs_status` FOREIGN KEY (`status_id`) REFERENCES `hearing_status` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `user_account`
--
ALTER TABLE `user_account`
  ADD CONSTRAINT `fk_user_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`role_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `user_log`
--
ALTER TABLE `user_log`
  ADD CONSTRAINT `fk_ul_target_cf` FOREIGN KEY (`target_cf_code`) REFERENCES `case_file` (`cf_code`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_ul_user` FOREIGN KEY (`user_id`) REFERENCES `user_account` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Seed data for lookup tables
--
INSERT INTO `role` (`role_id`, `role_name`, `description`) VALUES
(1, 'Admin', 'System administrator'),
(2, 'Attorney', 'Legal counsel / attorney'),
(3, 'Staff', 'Office staff'),
(5, 'User', 'Registered public user (read-only)')
ON DUPLICATE KEY UPDATE role_name=VALUES(role_name);

INSERT INTO `case_category` (`id`, `code`, `label`, `sort_order`) VALUES
(1, 'CIVIL', 'Civil', 1),
(2, 'CRIMINAL', 'Criminal', 2),
(3, 'CORPORATE', 'Corporate / Commercial', 3),
(4, 'FAMILY', 'Family', 4),
(5, 'LABOR', 'Labor / Employment', 5),
(6, 'PROPERTY', 'Property / Real Estate', 6),
(7, 'TAX', 'Tax', 7),
(8, 'IP', 'Intellectual Property', 8),
(9, 'IMMIGRATION', 'Immigration', 9),
(10, 'ADMIN', 'Administrative', 10),
(11, 'ENVIRONMENTAL', 'Environmental', 11)
ON DUPLICATE KEY UPDATE label=VALUES(label);

INSERT INTO `case_status` (`id`, `code`, `label`, `sort_order`) VALUES
(1, 'ACTIVE', 'Active', 1),
(2, 'PENDING', 'Pending', 2),
(3, 'CLOSED', 'Closed', 3),
(4, 'ARCHIVED', 'Archived', 4)
ON DUPLICATE KEY UPDATE label=VALUES(label);

INSERT INTO `case_priority` (`id`, `code`, `label`, `sort_order`) VALUES
(1, 'LOW', 'Low', 1),
(2, 'MEDIUM', 'Medium', 2),
(3, 'HIGH', 'High', 3),
(4, 'URGENT', 'Urgent', 4)
ON DUPLICATE KEY UPDATE label=VALUES(label);

INSERT INTO `document_status` (`id`, `code`, `label`, `sort_order`) VALUES
(1, 'ACTIVE', 'Active', 1),
(2, 'SUPERSEDED', 'Superseded', 2),
(3, 'ARCHIVED', 'Archived', 3)
ON DUPLICATE KEY UPDATE label=VALUES(label);

INSERT INTO `hearing_status` (`id`, `code`, `label`, `sort_order`) VALUES
(1, 'SCHEDULED', 'SCHEDULED', 1),
(2, 'COMPLETED', 'COMPLETED', 2),
(3, 'POSTPONED', 'POSTPONED', 3),
(4, 'CANCELLED', 'CANCELLED', 4)
ON DUPLICATE KEY UPDATE label=VALUES(label);

INSERT INTO `specialization` (`specialization_id`, `specialization_name`) VALUES
(1, 'General Practice'),
(2, 'Corporate / Commercial Law'),
(3, 'Criminal Defense'),
(4, 'Civil Litigation'),
(5, 'Family Law'),
(6, 'Labor & Employment Law'),
(7, 'Tax Law'),
(8, 'Intellectual Property'),
(9, 'Immigration Law'),
(10, 'Real Estate & Property'),
(11, 'Environmental Law'),
(12, 'Administrative Law')
ON DUPLICATE KEY UPDATE specialization_name=VALUES(specialization_name);


--
-- Seed attorneys (linked to user accounts) for the public directory
--
INSERT INTO `user_account` (`user_id`, `role_id`, `username`, `email`, `password_hash`, `is_active`, `created_at`, `updated_at`) VALUES
(101, 2, 'clara.vance', 'clara.vance@pacfas.gov', '$2b$10$29FCRFnCpVLlgDry.6w7/O/BNTorZYljXC9eDn5so0/U.js9eitcW', 1, NOW(), NOW()),
(102, 2, 'marcus.reyes', 'm.reyes@pacfas.gov', '$2b$10$29FCRFnCpVLlgDry.6w7/O/BNTorZYljXC9eDn5so0/U.js9eitcW', 1, NOW(), NOW()),
(103, 2, 'elena.rostova', 'elena@pacfas.gov', '$2b$10$29FCRFnCpVLlgDry.6w7/O/BNTorZYljXC9eDn5so0/U.js9eitcW', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE username=VALUES(username);

INSERT INTO `attorney` (`attorney_id`, `user_id`, `fname`, `lname`, `specialization_id`, `bar_number`, `created_at`, `updated_at`) VALUES
('A0001', 101, 'Clara', 'Vance', 2, 'BAR-2018-9921', NOW(), NOW()),
('A0002', 102, 'Marcus', 'Reyes', 3, 'BAR-2014-4412', NOW(), NOW()),
('A0003', 103, 'Elena', 'Rostova', 4, 'BAR-2021-1055', NOW(), NOW())
ON DUPLICATE KEY UPDATE fname=VALUES(fname);

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
