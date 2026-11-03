CREATE TABLE product_images (
    id UUID PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES stores(id),
    product_id BIGINT UNIQUE REFERENCES products(id),
    state VARCHAR(10) NOT NULL CHECK (state IN ('STAGED','ACTIVE','RETIRED')),
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    created_at TIMESTAMPTZ NOT NULL,
    delete_after TIMESTAMPTZ,
    CHECK ((state='ACTIVE' AND product_id IS NOT NULL AND delete_after IS NULL)
        OR (state<>'ACTIVE' AND product_id IS NULL AND delete_after IS NOT NULL))
);
CREATE INDEX product_images_cleanup_idx ON product_images(delete_after) WHERE state<>'ACTIVE';
