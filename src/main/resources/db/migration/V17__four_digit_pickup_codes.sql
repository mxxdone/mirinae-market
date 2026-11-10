-- 이미 발급된 6자리 코드와 매장·수령일별 유일성은 보존한다.
ALTER TABLE store_orders DROP CONSTRAINT pickup_code_format;
ALTER TABLE store_orders ADD CONSTRAINT pickup_code_format
 CHECK(pickup_code ~ '^([0-9]{4}|[0-9]{6})$');
