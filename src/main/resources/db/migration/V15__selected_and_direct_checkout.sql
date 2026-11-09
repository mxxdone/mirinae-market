ALTER TABLE checkouts ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'CART' CHECK (source IN ('CART','DIRECT'));
ALTER TABLE checkouts ADD COLUMN request_fingerprint VARCHAR(4096) NOT NULL DEFAULT 'ALL';
ALTER TABLE store_orders ADD COLUMN market_name VARCHAR(100);
UPDATE store_orders s SET market_name=m.name FROM markets m WHERE m.id=s.market_id;
ALTER TABLE store_orders ALTER COLUMN market_name SET NOT NULL;
