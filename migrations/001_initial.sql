CREATE TABLE orders (
  id serial PRIMARY KEY,
  public_id uuid NOT NULL UNIQUE,
  business_order_reference text NOT NULL UNIQUE CHECK (length(business_order_reference) BETWEEN 1 AND 128),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed', 'succeeded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE provider_events (
  id serial PRIMARY KEY,
  event_id text NOT NULL UNIQUE CHECK (length(event_id) BETWEEN 1 AND 128),
  order_id integer NOT NULL REFERENCES orders(id),
  outcome text NOT NULL CHECK (outcome IN ('failed', 'succeeded')),
  created_at timestamptz NOT NULL DEFAULT now()
);
