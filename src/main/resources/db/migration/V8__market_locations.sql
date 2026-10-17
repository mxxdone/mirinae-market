CREATE TABLE market_regions (
    code VARCHAR(5) PRIMARY KEY,
    province_code VARCHAR(2) NOT NULL,
    province_name VARCHAR(100) NOT NULL,
    province_short_name VARCHAR(100) NOT NULL,
    district_name VARCHAR(100) NOT NULL,
    selectable BOOLEAN NOT NULL
);

ALTER TABLE markets DROP CONSTRAINT markets_name_key;
ALTER TABLE markets ADD COLUMN region_code VARCHAR(5) REFERENCES market_regions(code);
ALTER TABLE markets ADD COLUMN address VARCHAR(500);
ALTER TABLE markets ADD COLUMN latitude DOUBLE PRECISION;
ALTER TABLE markets ADD COLUMN longitude DOUBLE PRECISION;
ALTER TABLE markets ADD CONSTRAINT complete_market_location CHECK (
    (region_code IS NULL AND address IS NULL AND latitude IS NULL AND longitude IS NULL)
    OR (region_code IS NOT NULL AND address IS NOT NULL AND length(trim(address)) > 0
        AND latitude IS NOT NULL AND latitude BETWEEN -90 AND 90
        AND longitude IS NOT NULL AND longitude BETWEEN -180 AND 180)
);
CREATE UNIQUE INDEX market_region_name_idx ON markets(region_code,name);
CREATE UNIQUE INDEX market_legacy_name_idx ON markets(name) WHERE region_code IS NULL;

CREATE TABLE market_candidates (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    region_code VARCHAR(5) REFERENCES market_regions(code),
    address VARCHAR(500),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    source_date DATE NOT NULL,
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
