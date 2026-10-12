ALTER TABLE pickup_windows ADD COLUMN order_deadline TIME;
UPDATE pickup_windows SET order_deadline = start_time;
ALTER TABLE pickup_windows ALTER COLUMN order_deadline SET NOT NULL;
ALTER TABLE pickup_windows ADD CONSTRAINT pickup_order_deadline_valid
    CHECK (order_deadline <= start_time AND extract(second FROM order_deadline) = 0);
