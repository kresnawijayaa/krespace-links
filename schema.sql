BEGIN;

CREATE TABLE IF NOT EXISTS products (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number integer NOT NULL UNIQUE CHECK (number BETWEEN 1 AND 999999),
  title varchar(160) NOT NULL CHECK (length(trim(title)) > 0),
  url varchar(4096) NOT NULL,
  image_url varchar(4096)
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS description varchar(500);
ALTER TABLE products ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

CREATE SEQUENCE IF NOT EXISTS products_number_seq AS integer MAXVALUE 999999;
ALTER SEQUENCE products_number_seq OWNED BY products.number;
ALTER TABLE products ALTER COLUMN number SET DEFAULT nextval('products_number_seq');

SELECT setval('products_number_seq',
  GREATEST(COALESCE((SELECT max(number) FROM products), 0),
           (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM products_number_seq),
           1),
  EXISTS (SELECT 1 FROM products) OR (SELECT is_called FROM products_number_seq)
);

COMMIT;
