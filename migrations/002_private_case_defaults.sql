-- Apply to existing installations after review/backups. Does not change existing
-- visibility decisions. Newly created cases default to private; the API also
-- explicitly inserts is_visible=0, including on older databases.
ALTER TABLE case_file MODIFY is_visible TINYINT(4) NOT NULL DEFAULT 0;
-- Administrators must separately review any existing is_visible=1 records.
-- No browser publishing control is implemented; publish only reviewed summaries
-- through controlled database administration, never by changing all rows.
