# Payment flow benchmark

Requires Docker with Compose, or Podman with a Compose provider; no host Node.js or PostgreSQL. All tooling runs in containers.

- `./run dev`: build, start PostgreSQL, apply migrations, and serve at `http://localhost:3000`. Source files are mounted for live reload; restart after dependency or configuration changes.
- `./run test`: compile and run Jest against a separate PostgreSQL service with database `checkout_test`.
- `./run format` / `./run format:check`: apply or check Prettier formatting, including the shell helper.
- `./run build`: build the application image.
- `./run stop`: remove service containers and networks, preserving development database data.

[compose.yaml](compose.yaml) defines services, database health checks, ports, and volumes. Test and tooling services use separate profiles. Use `CONTAINER_ENGINE=podman` to select Podman. You can also use Compose directly, for example `docker compose up --build api`. Credentials are local benchmark defaults. Concurrent test runs share the test database and must be serialized.

## API

The [OpenAPI 3.1 spec](openapi.json) is served at `GET /openapi.json`, with schemas, examples, validation rules, and retry/conflict behavior. Import it into an OpenAPI client or editor.

- `POST /checkout-intents`: `{"businessOrderReference":"merchant-123","amountMinor":"1999","currency":"EUR"}`. Returns 201 for creation, 200 for matching retries, with `{id,businessOrderReference,amountMinor,currency,status,createdAt,updatedAt}`. Timestamps are UTC ISO strings. Changed amount/currency returns 409.
- `POST /webhooks/payment`: `{"eventId":"evt-1","orderId":"<returned UUID>","outcome":"succeeded"}`. Outcome is `failed` or `succeeded`. Returns 200 with `{"duplicate":false}` after commit, or `{"duplicate":true}` for an identical committed event. Changed event payload returns 409; unknown order returns 404 without consuming the event ID. An unknown order is checked first, so it returns 404 even for a reused event ID.
- `GET /orders/:id`: returns the order, or 404. Malformed requests return 400; unexpected processing failures return 503. JSON objects reject unknown fields. Bodies are limited to 16 KiB.

Amounts are canonical positive decimal **strings of minor units**, stored as PostgreSQL `bigint` (maximum 9223372036854775807), avoiding JavaScript floating-point loss. Clients must know the currency's minor-unit exponent. Currency accepts three uppercase letters; this benchmark does not validate ISO membership. References and event IDs are case-sensitive, 1–128 characters, without leading/trailing whitespace. References are globally unique for this single-merchant service. Webhooks identify orders by immutable internal UUID. Event IDs are globally unique for one simulated provider.

## Correctness and transactions

Orders start `pending`. Allowed changes: `pending → failed`, `pending → succeeded`, `failed → succeeded`; repeated statuses are no-ops. Success is permanent. Failure may be corrected by later success, even with an earlier provider timestamp: outcomes have precedence, rather than arrival-time or timestamp precedence. Every distinct valid event is retained, including ignored failures after success. No provider timestamps are needed. Identical payload means the validated fields match; JSON key order is irrelevant.

Checkout runs insert-on-conflict and payload comparison in one transaction. PostgreSQL's unique reference constraint chooses one winner under concurrency. The subsequent read at READ COMMITTED sees the committed winner; a mismatch rolls back without changing it.

Each webhook locks its order with `SELECT FOR UPDATE`, inserts its event using the unique event ID, compares payload on conflict, and updates status in the **same transaction**. Locking before insertion also avoids foreign-key lock upgrade deadlocks between events on one order. Different orders can process concurrently. An event ID reused for another existing order or outcome is rejected, never reapplied. Database checks, foreign keys, and an update trigger enforce valid statuses, immutable checkout fields, and irreversible success even outside the application. Application/domain code chooses the transition; the database protects it. `updatedAt` changes only when the order changes, not on retries or ignored events.

HTTP 200 is sent only after transaction commit. Failures before commit roll back both event receipt and status. A provider can retry the identical event after 503 or an interrupted connection. If commit succeeds but the response is lost (or commit acknowledgement is ambiguous), the retry sees the stored event and returns duplicate success. A webhook arriving before checkout commits may receive 404 and should be retried after checkout exists. 409 is a payload conflict requiring correction, not blind retry.

## Verification and limitations

`./run test` includes HTTP tests with mocked persistence, plus real PostgreSQL integration tests for concurrent checkout conflicts, repeated and conflicting event IDs, out-of-order outcomes, permanent success, database guards, exact bigint amounts, and rollback after an injected database update failure. The database is deliberately real in concurrency tests: a network/database mock cannot demonstrate unique constraints or row locks. Tests use Supertest's local HTTP server and the application's real command/query buses and store. Migration execution is transactional and serialized with an advisory lock.

The implementation keeps a pure transition function and immutable domain types, small command/query buses, and one service composition root. There is no UI, external payment call, background queue, or deployment infrastructure. A dedicated load generator and measured latency/throughput results are unfinished; concurrent correctness tests are not performance measurements. A next step would be a containerized load test with fixed hardware, realistic traffic, pool sizes and percentile latency reporting. Connection-loss-at-commit is explained through transaction/idempotency behavior but not fault-injected; add a PostgreSQL network proxy to verify that path.

Before production: scope references by merchant and event IDs by provider, validate supported currencies, add authentication and webhook signatures, protect secrets, bound database statement/lock durations, rate-limit inputs, instrument errors/latency/lock contention, document provider retry behavior, and add backup/restore and migration upgrade checks. Those are intentionally not built here. For ORM API details see the [Drizzle PostgreSQL documentation](https://orm.drizzle.team/docs/get-started/postgresql-existing).
