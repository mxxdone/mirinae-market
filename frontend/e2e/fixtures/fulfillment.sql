-- 고정 시각 2026-10-13 12:00 KST의 수령 운영 전용 테스트 자료다.
-- 일반 결제 생성과 시간 경계는 백엔드 integration에서 검증하고 브라우저는 실제 저장 주문을 사용한다.
INSERT INTO markets(name) VALUES ('수령검증시장') ON CONFLICT DO NOTHING;
INSERT INTO accounts(login_id,password_hash,display_name,email,role)
SELECT x.login_id,a.password_hash,x.name,x.login_id||'@example.com',x.role
FROM accounts a CROSS JOIN (VALUES
 ('fulfill_buyer','수령검증 구매자','BUYER'),
 ('fulfill_seller_gen','일반취소 판매자','SELLER'),
 ('fulfill_seller_ready','수령준비 판매자','SELLER'),
 ('fulfill_seller_miss','미수령 판매자','SELLER')
) x(login_id,name,role) WHERE a.login_id=:'source_buyer'
ON CONFLICT(login_id) DO NOTHING;
INSERT INTO stores(market_id,owner_account_id,name)
SELECT m.id,a.id,CASE a.login_id WHEN 'fulfill_seller_gen' THEN '일반취소 검증매장'
 WHEN 'fulfill_seller_ready' THEN '수령준비 검증매장' ELSE '미수령 검증매장' END
FROM accounts a CROSS JOIN markets m WHERE a.login_id LIKE 'fulfill_seller_%' AND m.name='수령검증시장'
ON CONFLICT(owner_account_id) DO NOTHING;
INSERT INTO pickup_windows(store_id,pickup_date,order_deadline,start_time,end_time,orders_locked)
SELECT s.id,'2026-10-13',x.deadline::time,x.start_time::time,x.end_time::time,true
FROM stores s JOIN accounts a ON a.id=s.owner_account_id JOIN (VALUES
 ('fulfill_seller_gen','13:00','14:00','18:00'),
 ('fulfill_seller_ready','10:00','11:00','14:00'),
 ('fulfill_seller_miss','09:00','10:00','11:00')
) x(login_id,deadline,start_time,end_time) ON a.login_id=x.login_id
ON CONFLICT DO NOTHING;
INSERT INTO products(store_id,name,unit_type,unit_amount)
SELECT s.id,x.name,'COUNT',1 FROM stores s JOIN accounts a ON a.id=s.owner_account_id
CROSS JOIN (VALUES ('검증 사과'),('검증 배')) x(name)
WHERE a.login_id LIKE 'fulfill_seller_%'
AND NOT EXISTS(SELECT 1 FROM products p WHERE p.store_id=s.id AND p.name=x.name);
INSERT INTO daily_offers(store_id,product_id,pickup_date,price_won,online_quantity)
SELECT p.store_id,p.id,'2026-10-13',1000,90 FROM products p JOIN stores s ON s.id=p.store_id
JOIN accounts a ON a.id=s.owner_account_id WHERE a.login_id LIKE 'fulfill_seller_%'
ON CONFLICT DO NOTHING;
INSERT INTO checkouts(buyer_id,request_key,cart_version,mode,status,total_won,due_at,created_at,confirmed_at)
SELECT a.id,x.key,x.version,'SUCCESS','CONFIRMED',2000,'2026-10-13T00:00:00Z','2026-10-13T00:00:00Z','2026-10-13T00:00:00Z'
FROM accounts a CROSS JOIN (VALUES ('phase5-general',100),('phase5-collection',101),('phase5-failure',102)) x(key,version)
WHERE a.login_id='fulfill_buyer' ON CONFLICT DO NOTHING;
INSERT INTO store_orders(checkout_id,store_id,market_id,store_name,pickup_date,order_deadline,start_time,end_time,pickup_code)
SELECT c.id,s.id,s.market_id,s.name,w.pickup_date,w.order_deadline,w.start_time,w.end_time,CASE WHEN c.request_key='phase5-failure' THEN '135790' ELSE '246810' END
FROM checkouts c JOIN (VALUES ('phase5-general','fulfill_seller_gen'),
 ('phase5-collection','fulfill_seller_ready'),('phase5-collection','fulfill_seller_miss'),
 ('phase5-failure','fulfill_seller_ready')) x(key,seller) ON c.request_key=x.key
JOIN accounts a ON a.login_id=x.seller JOIN stores s ON s.owner_account_id=a.id
JOIN pickup_windows w ON w.store_id=s.id AND w.pickup_date='2026-10-13'
ON CONFLICT DO NOTHING;
INSERT INTO order_items(store_order_id,offer_id,product_name,unit_type,unit_amount,price_won,quantity)
SELECT s.id,o.id,p.name,'COUNT',1,1000,CASE WHEN c.request_key='phase5-general' THEN 2 ELSE 1 END
FROM store_orders s JOIN checkouts c ON c.id=s.checkout_id JOIN daily_offers o ON o.store_id=s.store_id AND o.pickup_date=s.pickup_date
JOIN products p ON p.id=o.product_id
WHERE c.request_key IN ('phase5-general','phase5-collection','phase5-failure')
AND (c.request_key='phase5-failure' OR p.name='검증 사과') ON CONFLICT DO NOTHING;

-- 자동 재시도 소진 뒤 관리자가 확인하는 모의 환불 자료다.
INSERT INTO checkouts(buyer_id,request_key,cart_version,mode,status,total_won,due_at,created_at,confirmed_at)
SELECT id,'phase5-attention',103,'SUCCESS','CONFIRMED',1000,'2026-10-13T00:00:00Z','2026-10-13T00:00:00Z','2026-10-13T00:00:00Z'
FROM accounts WHERE login_id='fulfill_buyer' ON CONFLICT DO NOTHING;
INSERT INTO store_orders(checkout_id,store_id,market_id,store_name,pickup_date,order_deadline,start_time,end_time,pickup_code)
SELECT c.id,s.id,s.market_id,s.name,w.pickup_date,w.order_deadline,w.start_time,w.end_time,'987654'
FROM checkouts c JOIN accounts a ON a.login_id='fulfill_seller_gen'
JOIN stores s ON s.owner_account_id=a.id JOIN pickup_windows w ON w.store_id=s.id AND w.pickup_date='2026-10-13'
WHERE c.request_key='phase5-attention' ON CONFLICT DO NOTHING;
INSERT INTO order_items(store_order_id,offer_id,product_name,unit_type,unit_amount,price_won,quantity,cancelled_at,cancellation_type,cancellation_reason,cancelled_by)
SELECT s.id,o.id,p.name,'COUNT',1,1000,1,'2026-10-13T01:00:00Z','GENERAL','구매자 일반 취소',c.buyer_id
FROM store_orders s JOIN checkouts c ON c.id=s.checkout_id
JOIN daily_offers o ON o.store_id=s.store_id AND o.pickup_date=s.pickup_date JOIN products p ON p.id=o.product_id
WHERE c.request_key='phase5-attention' AND p.name='검증 사과' ON CONFLICT DO NOTHING;
INSERT INTO order_operations(actor_id,request_key,store_order_id,fingerprint,created_at)
SELECT c.buyer_id,'phase5-attention',s.id,'e2e-refund-attention','2026-10-13T01:00:00Z'
FROM store_orders s JOIN checkouts c ON c.id=s.checkout_id WHERE c.request_key='phase5-attention' ON CONFLICT DO NOTHING;
INSERT INTO refunds(operation_id,store_order_id,amount_won,status,mode,attempts,last_error,due_at,created_at)
SELECT op.id,op.store_order_id,1000,'NEEDS_ATTENTION','PERMANENT_FAILURE',4,'모의 제공자 오류: 관리자 확인 필요','2026-10-13T01:00:00Z','2026-10-13T01:00:00Z'
FROM order_operations op WHERE op.request_key='phase5-attention' ON CONFLICT DO NOTHING;
