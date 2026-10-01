ALTER TABLE provider_events DROP CONSTRAINT provider_events_order_id_fkey;

ALTER TABLE orders RENAME COLUMN id TO public_id;
ALTER TABLE orders DROP CONSTRAINT orders_pkey;
ALTER TABLE orders ADD COLUMN id serial PRIMARY KEY;
ALTER TABLE orders ADD CONSTRAINT orders_public_id_key UNIQUE (public_id);

ALTER TABLE provider_events RENAME COLUMN order_id TO order_public_id;
ALTER TABLE provider_events ADD COLUMN order_id integer;
UPDATE provider_events
SET order_id = orders.id
FROM orders
WHERE provider_events.order_public_id = orders.public_id;
ALTER TABLE provider_events ALTER COLUMN order_id SET NOT NULL;
ALTER TABLE provider_events DROP COLUMN order_public_id;
ALTER TABLE provider_events ADD CONSTRAINT provider_events_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE provider_events DROP CONSTRAINT provider_events_pkey;
ALTER TABLE provider_events ADD COLUMN id serial PRIMARY KEY;
ALTER TABLE provider_events ADD CONSTRAINT provider_events_event_id_key UNIQUE (event_id);

ALTER TABLE schema_migrations DROP CONSTRAINT schema_migrations_pkey;
ALTER TABLE schema_migrations ADD COLUMN id serial PRIMARY KEY;
ALTER TABLE schema_migrations ADD CONSTRAINT schema_migrations_version_key UNIQUE (version);
