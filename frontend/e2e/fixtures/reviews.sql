-- 리뷰 브라우저 검증 전용 자료다. 독립 E2E DB에만 적재한다.
INSERT INTO markets(name) VALUES ('리뷰검증시장') ON CONFLICT DO NOTHING;
INSERT INTO accounts(login_id,password_hash,display_name,email,role)
SELECT x.login_id,a.password_hash,x.name,x.login_id||'@example.com',x.role
FROM accounts a CROSS JOIN (VALUES
 ('review_buyer','리뷰구매자','BUYER'),('review_seller','리뷰판매자','SELLER')
) x(login_id,name,role) WHERE a.login_id=:'source_buyer'
ON CONFLICT(login_id) DO NOTHING;
INSERT INTO stores(market_id,owner_account_id,name)
SELECT m.id,a.id,'리뷰검증매장' FROM accounts a CROSS JOIN markets m
WHERE a.login_id='review_seller' AND m.name='리뷰검증시장' ON CONFLICT(owner_account_id) DO NOTHING;
INSERT INTO pickup_windows(store_id,pickup_date,order_deadline,start_time,end_time)
SELECT s.id,'2026-10-13','13:00','14:00','18:00' FROM stores s JOIN accounts a ON a.id=s.owner_account_id
WHERE a.login_id='review_seller' ON CONFLICT DO NOTHING;
INSERT INTO products(store_id,name,unit_type,unit_amount)
SELECT s.id,x.name,'COUNT',1 FROM stores s JOIN accounts a ON a.id=s.owner_account_id
CROSS JOIN (VALUES ('리뷰 사과'),('리뷰 배')) x(name) WHERE a.login_id='review_seller'
AND NOT EXISTS(SELECT 1 FROM products p WHERE p.store_id=s.id AND p.name=x.name);
INSERT INTO daily_offers(store_id,product_id,pickup_date,price_won,online_quantity)
SELECT p.store_id,p.id,'2026-10-13',1000,90 FROM products p JOIN stores s ON s.id=p.store_id
JOIN accounts a ON a.id=s.owner_account_id WHERE a.login_id='review_seller' ON CONFLICT DO NOTHING;

-- 신규 구매와 리뷰 작성은 서로 다른 날의 주문이다. 수령 자격 자체는 HTTP integration에서 검증한다.
INSERT INTO pickup_windows(store_id,pickup_date,order_deadline,start_time,end_time,orders_locked)
SELECT s.id,'2026-10-12','13:00','14:00','18:00',true FROM stores s JOIN accounts a ON a.id=s.owner_account_id
WHERE a.login_id='review_seller' ON CONFLICT DO NOTHING;
INSERT INTO daily_offers(store_id,product_id,pickup_date,price_won,online_quantity)
SELECT p.store_id,p.id,'2026-10-12',1000,89 FROM products p JOIN stores s ON s.id=p.store_id
JOIN accounts a ON a.id=s.owner_account_id WHERE a.login_id='review_seller' ON CONFLICT DO NOTHING;
INSERT INTO checkouts(buyer_id,request_key,cart_version,mode,status,total_won,due_at,created_at,confirmed_at)
SELECT a.id,'review-picked-up',100,'SUCCESS','CONFIRMED',2000,'2026-10-12T03:00:00Z','2026-10-12T03:00:00Z','2026-10-12T03:00:00Z'
FROM accounts a WHERE a.login_id='review_buyer' ON CONFLICT DO NOTHING;
INSERT INTO store_orders(checkout_id,store_id,market_id,market_name,store_name,pickup_date,order_deadline,start_time,end_time,pickup_code,picked_up_at)
SELECT c.id,s.id,s.market_id,(SELECT name FROM markets WHERE id=s.market_id),s.name,'2026-10-12','13:00','14:00','18:00','975310','2026-10-12T05:00:00Z'
FROM checkouts c JOIN accounts a ON a.id=c.buyer_id CROSS JOIN stores s JOIN accounts owner ON owner.id=s.owner_account_id
WHERE a.login_id='review_buyer' AND c.request_key='review-picked-up' AND owner.login_id='review_seller' ON CONFLICT DO NOTHING;
INSERT INTO order_items(store_order_id,offer_id,product_name,unit_type,unit_amount,price_won,quantity)
SELECT so.id,o.id,p.name,p.unit_type,p.unit_amount,o.price_won,1
FROM store_orders so JOIN checkouts c ON c.id=so.checkout_id
JOIN daily_offers o ON o.store_id=so.store_id AND o.pickup_date=so.pickup_date JOIN products p ON p.id=o.product_id
WHERE c.request_key='review-picked-up' AND NOT EXISTS(SELECT 1 FROM order_items i WHERE i.store_order_id=so.id AND i.offer_id=o.id);
