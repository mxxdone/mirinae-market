INSERT INTO markets(name) VALUES ('결제검증시장') ON CONFLICT DO NOTHING;
INSERT INTO accounts(login_id,password_hash,display_name,email,role)
SELECT 'checkout_seller_a',password_hash,'검증상인','checkout_a@example.com','SELLER' FROM accounts WHERE login_id=:'source_seller_a'
ON CONFLICT(login_id) DO NOTHING;
INSERT INTO accounts(login_id,password_hash,display_name,email,role)
SELECT 'checkout_seller_b',password_hash,'검증상인','checkout_b@example.com','SELLER' FROM accounts WHERE login_id=:'source_seller_b'
ON CONFLICT(login_id) DO NOTHING;
INSERT INTO stores(market_id,owner_account_id,name)
SELECT m.id,a.id,CASE a.login_id WHEN 'checkout_seller_a' THEN '결제검증 첫매장' ELSE '결제검증 둘째매장' END
FROM accounts a CROSS JOIN markets m WHERE a.login_id IN ('checkout_seller_a','checkout_seller_b') AND m.name='결제검증시장'
ON CONFLICT(owner_account_id) DO NOTHING;
