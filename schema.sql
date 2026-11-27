CREATE TABLE IF NOT EXISTS products (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number integer NOT NULL UNIQUE CHECK (number BETWEEN 1 AND 999999),
  title varchar(160) NOT NULL CHECK (length(trim(title)) > 0),
  url varchar(4096) NOT NULL,
  image_url varchar(4096)
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS description varchar(500);
