-- Phase 6 판매자 대시보드 전용 독립 테스트 자료다.
-- 고정 시각 2026-10-13 12:00 KST (03:00 UTC) 이전 시각으로 일별 상태·준비 수량·누적 주문/구매자·월별 모의 결제를 검증한다.
INSERT INTO markets(name) VALUES ('대시보드검증시장') ON CONFLICT DO NOTHING;

INSERT INTO accounts(login_id, password_hash, display_name, email, role)
SELECT x.login_id, a.password_hash, x.name, x.login_id || '@example.com', x.role
FROM accounts a CROSS JOIN (VALUES
 ('dashboard_buyer_a', '대시보드 구매자A', 'BUYER'),
 ('dashboard_buyer_b', '대시보드 구매자B', 'BUYER'),
 ('dashboard_buyer_c', '대시보드 구매자C', 'BUYER'),
 ('dashboard_seller', '대시보드 판매자', 'SELLER')
) x(login_id, name, role)
WHERE a.login_id = :'source_buyer'
ON CONFLICT(login_id) DO NOTHING;

INSERT INTO stores(market_id, owner_account_id, name)
SELECT m.id, a.id, '대시보드 검증매장'
FROM accounts a CROSS JOIN markets m
WHERE a.login_id = 'dashboard_seller' AND m.name = '대시보드검증시장'
ON CONFLICT(owner_account_id) DO NOTHING;

INSERT INTO pickup_windows(store_id, pickup_date, order_deadline, start_time, end_time, orders_locked)
SELECT s.id, '2026-10-13', '10:00'::time, '10:30'::time, '18:00'::time, true
FROM stores s JOIN accounts a ON a.id = s.owner_account_id
WHERE a.login_id = 'dashboard_seller'
ON CONFLICT DO NOTHING;

INSERT INTO products(store_id, name, unit_type, unit_amount)
SELECT s.id, x.name, x.unit_type, x.unit_amount
FROM stores s JOIN accounts a ON a.id = s.owner_account_id
CROSS JOIN (VALUES
  ('대시보드 사과', 'COUNT', 1),
  ('대시보드 배', 'WEIGHT', 500)
) x(name, unit_type, unit_amount)
WHERE a.login_id = 'dashboard_seller'
AND NOT EXISTS (SELECT 1 FROM products p WHERE p.store_id = s.id AND p.name = x.name);

INSERT INTO daily_offers(store_id, product_id, pickup_date, price_won, online_quantity)
SELECT p.store_id, p.id, '2026-10-13', CASE WHEN p.name = '대시보드 사과' THEN 1000 ELSE 3000 END, 100
FROM products p JOIN stores s ON s.id = p.store_id JOIN accounts a ON a.id = s.owner_account_id
WHERE a.login_id = 'dashboard_seller'
ON CONFLICT DO NOTHING;

-- 1. 대기 주문 (구매자 A): 사과 1개(1,000원) + 배 1개(3,000원) = 4,000원
INSERT INTO checkouts(buyer_id, request_key, cart_version, mode, status, total_won, due_at, created_at, confirmed_at)
SELECT a.id, 'phase6-waiting', 201, 'SUCCESS', 'CONFIRMED', 4000, '2026-10-13T00:10:00Z', '2026-10-13T00:10:00Z', '2026-10-13T00:10:00Z'
FROM accounts a WHERE a.login_id = 'dashboard_buyer_a' ON CONFLICT DO NOTHING;

INSERT INTO store_orders(checkout_id, store_id, market_id, store_name, pickup_date, order_deadline, start_time, end_time, pickup_code)
SELECT c.id, s.id, s.market_id, s.name, w.pickup_date, w.order_deadline, w.start_time, w.end_time, '111111'
FROM checkouts c JOIN accounts a ON a.login_id = 'dashboard_seller'
JOIN stores s ON s.owner_account_id = a.id
JOIN pickup_windows w ON w.store_id = s.id AND w.pickup_date = '2026-10-13'
WHERE c.request_key = 'phase6-waiting' ON CONFLICT DO NOTHING;

INSERT INTO order_items(store_order_id, offer_id, product_name, unit_type, unit_amount, price_won, quantity)
SELECT s.id, o.id, p.name, p.unit_type, p.unit_amount, o.price_won, 1
FROM store_orders s JOIN checkouts c ON c.id = s.checkout_id
JOIN daily_offers o ON o.store_id = s.store_id AND o.pickup_date = s.pickup_date
JOIN products p ON p.id = o.product_id
WHERE c.request_key = 'phase6-waiting' ON CONFLICT DO NOTHING;

-- 2. 부분 취소 대기 주문 (구매자 A): 사과 1개(1,000원, 취소) + 배 1개(3,000원, 정상) = 4,000원 (환불 1,000원 완료)
INSERT INTO checkouts(buyer_id, request_key, cart_version, mode, status, total_won, due_at, created_at, confirmed_at)
SELECT a.id, 'phase6-partial', 202, 'SUCCESS', 'CONFIRMED', 4000, '2026-10-13T00:20:00Z', '2026-10-13T00:20:00Z', '2026-10-13T00:20:00Z'
FROM accounts a WHERE a.login_id = 'dashboard_buyer_a' ON CONFLICT DO NOTHING;

INSERT INTO store_orders(checkout_id, store_id, market_id, store_name, pickup_date, order_deadline, start_time, end_time, pickup_code)
SELECT c.id, s.id, s.market_id, s.name, w.pickup_date, w.order_deadline, w.start_time, w.end_time, '222222'
FROM checkouts c JOIN accounts a ON a.login_id = 'dashboard_seller'
JOIN stores s ON s.owner_account_id = a.id
JOIN pickup_windows w ON w.store_id = s.id AND w.pickup_date = '2026-10-13'
WHERE c.request_key = 'phase6-partial' ON CONFLICT DO NOTHING;

INSERT INTO order_items(store_order_id, offer_id, product_name, unit_type, unit_amount, price_won, quantity, cancelled_at, cancellation_type, cancellation_reason, cancelled_by)
SELECT s.id, o.id, p.name, p.unit_type, p.unit_amount, o.price_won, 1,
  CASE WHEN p.name = '대시보드 사과' THEN '2026-10-13T00:30:00Z'::timestamptz ELSE NULL END,
  CASE WHEN p.name = '대시보드 사과' THEN 'FULFILLMENT_FAILURE' ELSE NULL END,
  CASE WHEN p.name = '대시보드 사과' THEN '상품 제공 불가' ELSE NULL END,
  CASE WHEN p.name = '대시보드 사과' THEN c.buyer_id ELSE NULL END
FROM store_orders s JOIN checkouts c ON c.id = s.checkout_id
JOIN daily_offers o ON o.store_id = s.store_id AND o.pickup_date = s.pickup_date
JOIN products p ON p.id = o.product_id
WHERE c.request_key = 'phase6-partial' ON CONFLICT DO NOTHING;

INSERT INTO order_operations(actor_id, request_key, store_order_id, fingerprint, created_at)
SELECT c.buyer_id, 'phase6-partial-op', s.id, 'e2e-phase6-partial', '2026-10-13T00:30:00Z'
FROM store_orders s JOIN checkouts c ON c.id = s.checkout_id
WHERE c.request_key = 'phase6-partial' ON CONFLICT DO NOTHING;

INSERT INTO refunds(operation_id, store_order_id, amount_won, status, mode, attempts, last_error, due_at, created_at, completed_at)
SELECT op.id, op.store_order_id, 1000, 'COMPLETED', 'SUCCESS', 1, NULL, '2026-10-13T00:30:00Z', '2026-10-13T00:30:00Z', '2026-10-13T00:30:00Z'
FROM order_operations op WHERE op.request_key = 'phase6-partial-op' ON CONFLICT DO NOTHING;

-- 3. 수령 완료 주문 (구매자 B): 사과 1개만! = 1,000원 (수령 시각 02:00 UTC)
INSERT INTO checkouts(buyer_id, request_key, cart_version, mode, status, total_won, due_at, created_at, confirmed_at)
SELECT a.id, 'phase6-picked', 203, 'SUCCESS', 'CONFIRMED', 1000, '2026-10-13T00:15:00Z', '2026-10-13T00:15:00Z', '2026-10-13T00:15:00Z'
FROM accounts a WHERE a.login_id = 'dashboard_buyer_b' ON CONFLICT DO NOTHING;

INSERT INTO store_orders(checkout_id, store_id, market_id, store_name, pickup_date, order_deadline, start_time, end_time, pickup_code, picked_up_at)
SELECT c.id, s.id, s.market_id, s.name, w.pickup_date, w.order_deadline, w.start_time, w.end_time, '333333', '2026-10-13T02:00:00Z'
FROM checkouts c JOIN accounts a ON a.login_id = 'dashboard_seller'
JOIN stores s ON s.owner_account_id = a.id
JOIN pickup_windows w ON w.store_id = s.id AND w.pickup_date = '2026-10-13'
WHERE c.request_key = 'phase6-picked' ON CONFLICT DO NOTHING;

INSERT INTO order_items(store_order_id, offer_id, product_name, unit_type, unit_amount, price_won, quantity)
SELECT s.id, o.id, p.name, p.unit_type, p.unit_amount, o.price_won, 1
FROM store_orders s JOIN checkouts c ON c.id = s.checkout_id
JOIN daily_offers o ON o.store_id = s.store_id AND o.pickup_date = s.pickup_date
JOIN products p ON p.id = o.product_id
WHERE c.request_key = 'phase6-picked' AND p.name = '대시보드 사과' ON CONFLICT DO NOTHING;

-- 4. 전체 취소 주문 (구매자 C): 사과 1개만! = 1,000원 (환불 1,000원 완료)
INSERT INTO checkouts(buyer_id, request_key, cart_version, mode, status, total_won, due_at, created_at, confirmed_at)
SELECT a.id, 'phase6-cancelled', 204, 'SUCCESS', 'CONFIRMED', 1000, '2026-10-13T00:25:00Z', '2026-10-13T00:25:00Z', '2026-10-13T00:25:00Z'
FROM accounts a WHERE a.login_id = 'dashboard_buyer_c' ON CONFLICT DO NOTHING;

INSERT INTO store_orders(checkout_id, store_id, market_id, store_name, pickup_date, order_deadline, start_time, end_time, pickup_code)
SELECT c.id, s.id, s.market_id, s.name, w.pickup_date, w.order_deadline, w.start_time, w.end_time, '444444'
FROM checkouts c JOIN accounts a ON a.login_id = 'dashboard_seller'
JOIN stores s ON s.owner_account_id = a.id
JOIN pickup_windows w ON w.store_id = s.id AND w.pickup_date = '2026-10-13'
WHERE c.request_key = 'phase6-cancelled' ON CONFLICT DO NOTHING;

INSERT INTO order_items(store_order_id, offer_id, product_name, unit_type, unit_amount, price_won, quantity, cancelled_at, cancellation_type, cancellation_reason, cancelled_by)
SELECT s.id, o.id, p.name, p.unit_type, p.unit_amount, o.price_won, 1, '2026-10-13T00:45:00Z', 'GENERAL', '구매자 전체 취소', c.buyer_id
FROM store_orders s JOIN checkouts c ON c.id = s.checkout_id
JOIN daily_offers o ON o.store_id = s.store_id AND o.pickup_date = s.pickup_date
JOIN products p ON p.id = o.product_id
WHERE c.request_key = 'phase6-cancelled' AND p.name = '대시보드 사과' ON CONFLICT DO NOTHING;

INSERT INTO order_operations(actor_id, request_key, store_order_id, fingerprint, created_at)
SELECT c.buyer_id, 'phase6-cancel-op', s.id, 'e2e-phase6-cancel', '2026-10-13T00:45:00Z'
FROM store_orders s JOIN checkouts c ON c.id = s.checkout_id
WHERE c.request_key = 'phase6-cancelled' ON CONFLICT DO NOTHING;

INSERT INTO refunds(operation_id, store_order_id, amount_won, status, mode, attempts, last_error, due_at, created_at, completed_at)
SELECT op.id, op.store_order_id, 1000, 'COMPLETED', 'SUCCESS', 1, NULL, '2026-10-13T00:45:00Z', '2026-10-13T00:45:00Z', '2026-10-13T00:45:00Z'
FROM order_operations op WHERE op.request_key = 'phase6-cancel-op' ON CONFLICT DO NOTHING;
