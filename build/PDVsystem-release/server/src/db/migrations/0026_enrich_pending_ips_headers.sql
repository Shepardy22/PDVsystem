-- 0026_enrich_pending_ips_headers.sql
ALTER TABLE pending_ips ADD COLUMN accept_language TEXT;
ALTER TABLE pending_ips ADD COLUMN accept_header TEXT;
ALTER TABLE pending_ips ADD COLUMN accept_encoding TEXT;
ALTER TABLE pending_ips ADD COLUMN forwarded_for_raw TEXT;
ALTER TABLE pending_ips ADD COLUMN remote_port INTEGER;
ALTER TABLE pending_ips ADD COLUMN http_version TEXT;
