CREATE TABLE orders (
  id uuid PRIMARY KEY,
  business_order_reference text NOT NULL UNIQUE CHECK (length(business_order_reference) BETWEEN 1 AND 128),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed', 'succeeded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE provider_events (
  event_id text PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 128),
  order_id uuid NOT NULL REFERENCES orders(id),
  outcome text NOT NULL CHECK (outcome IN ('failed', 'succeeded')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION enforce_order_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.business_order_reference <> OLD.business_order_reference OR NEW.amount_minor <> OLD.amount_minor OR NEW.currency <> OLD.currency OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Order identity and checkout payload are immutable';
  END IF;
  IF (OLD.status = 'succeeded' AND NEW.status <> 'succeeded') OR (OLD.status = 'failed' AND NEW.status = 'pending') THEN
    RAISE EXCEPTION 'Invalid payment status transition';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER order_transition BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION enforce_order_transition();
