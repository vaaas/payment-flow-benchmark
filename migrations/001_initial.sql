CREATE TABLE orders (
  id serial PRIMARY KEY,
  public_id uuid NOT NULL UNIQUE,
  business_order_reference text NOT NULL UNIQUE,
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE provider_events (
  id serial PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  order_id integer NOT NULL REFERENCES orders(id),
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE checkout_idempotency_keys (
  id serial PRIMARY KEY,
  key text NOT NULL UNIQUE,
  order_id integer NOT NULL REFERENCES orders(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
