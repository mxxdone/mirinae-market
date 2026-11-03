-- 이미 발급한 비충돌 코드는 보존하고 같은 매장·날짜의 중복 코드만 보정한다.
DO $$
DECLARE duplicate_order RECORD; free_code TEXT;
BEGIN
 IF EXISTS(SELECT 1 FROM store_orders GROUP BY store_id,pickup_date HAVING count(*)>1000000) THEN
  RAISE EXCEPTION '매장·수령일별 수령 코드 공간을 초과했습니다';
 END IF;
 FOR duplicate_order IN
  SELECT id,store_id,pickup_date FROM (
   SELECT id,store_id,pickup_date,row_number() OVER(PARTITION BY store_id,pickup_date,pickup_code ORDER BY id) AS position
   FROM store_orders
  ) duplicates WHERE position>1 ORDER BY id
 LOOP
  SELECT lpad(n::text,6,'0') INTO free_code FROM generate_series(0,999999) n
  WHERE NOT EXISTS(SELECT 1 FROM store_orders s WHERE s.store_id=duplicate_order.store_id
   AND s.pickup_date=duplicate_order.pickup_date AND s.pickup_code=lpad(n::text,6,'0')) LIMIT 1;
  IF free_code IS NULL THEN RAISE EXCEPTION '수령 코드를 할당할 수 없습니다'; END IF;
  UPDATE store_orders SET pickup_code=free_code WHERE id=duplicate_order.id;
 END LOOP;
END $$;
ALTER TABLE store_orders ALTER COLUMN pickup_code DROP DEFAULT;
CREATE UNIQUE INDEX store_order_pickup_code_idx ON store_orders(store_id,pickup_date,pickup_code);
ALTER TABLE refunds ADD COLUMN attempt_token VARCHAR(36);
