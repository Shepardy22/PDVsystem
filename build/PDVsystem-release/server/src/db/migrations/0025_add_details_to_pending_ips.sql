-- 0025_add_details_to_pending_ips.sql
ALTER TABLE pending_ips ADD COLUMN user_agent TEXT;
ALTER TABLE pending_ips ADD COLUMN requested_path TEXT;
ALTER TABLE pending_ips ADD COLUMN request_method TEXT;
ALTER TABLE pending_ips ADD COLUMN referer TEXT;
