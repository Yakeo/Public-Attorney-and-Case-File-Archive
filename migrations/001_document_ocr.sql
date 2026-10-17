-- Apply ONCE to an existing database before starting the updated application.
-- Back up first. MySQL DDL commits implicitly; this is not an atomic migration.
-- Preflight: this query MUST return no rows. Resolve duplicates before proceeding:
-- SELECT document_code, version_no, COUNT(*) FROM document_version
-- GROUP BY document_code, version_no HAVING COUNT(*) > 1;

ALTER TABLE document MODIFY file_type VARCHAR(100) DEFAULT NULL;
ALTER TABLE document_version
  ADD COLUMN ocr_status ENUM('PENDING','PROCESSING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN ocr_error VARCHAR(255) DEFAULT NULL,
  ADD UNIQUE KEY uq_document_version (document_code, version_no);

-- Existing useful text stays usable. Previously unfinished/empty jobs require an
-- explicit retry rather than claiming they are still running after deployment.
UPDATE document_version
SET ocr_status = CASE
      WHEN extracted_text IS NOT NULL AND CHAR_LENGTH(TRIM(extracted_text)) > 0 THEN 'COMPLETED'
      ELSE 'FAILED' END,
    ocr_error = CASE
      WHEN extracted_text IS NOT NULL AND CHAR_LENGTH(TRIM(extracted_text)) > 0 THEN NULL
      ELSE 'Previous extraction did not complete. Retry text extraction.' END;
