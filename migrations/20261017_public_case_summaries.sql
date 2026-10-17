-- Explicitly approved public case summaries and versioned PDF copies.
-- Apply once to existing databases. Public endpoints read only is_current=1 rows.
CREATE TABLE IF NOT EXISTS `public_case_summary` (
  `public_case_summary_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cf_code` int(11) NOT NULL,
  `version_no` int unsigned NOT NULL,
  `public_title` varchar(150) NOT NULL,
  `summary_text` text NOT NULL,
  `handling_attorney_id` char(5) NOT NULL,
  `pdf_file_path` varchar(500) NOT NULL,
  `pdf_file_name` varchar(255) NOT NULL,
  `approved_by` int(11) NOT NULL,
  `approved_at` datetime NOT NULL,
  `is_current` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`public_case_summary_id`),
  UNIQUE KEY `uq_public_summary_case_version` (`cf_code`, `version_no`),
  KEY `idx_public_summary_publication` (`cf_code`, `is_current`, `approved_at`),
  KEY `fk_public_summary_attorney` (`handling_attorney_id`),
  KEY `fk_public_summary_approver` (`approved_by`),
  CONSTRAINT `fk_public_summary_case` FOREIGN KEY (`cf_code`) REFERENCES `case_file` (`cf_code`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_public_summary_attorney` FOREIGN KEY (`handling_attorney_id`) REFERENCES `attorney` (`attorney_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_public_summary_approver` FOREIGN KEY (`approved_by`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
