# Payment flow benchmark

Needs docker/podman + compose only (no node.js/psql).

## Usage

- `./run dev`: server `http://localhost:3000`
- `./run test`: image build (eslint, tsc), lint, `jest --runInBand` on separate test Postgres
- `./run mutate [args]`: Stryker, manual only (~30 min), args to `stryker run`; fails <75%; `stryker.config.json`, report `reports/mutation/index.html`
- `./run format`/`format:check`: prettier
- `./run npm ...`: `npm ci` then `npm ...` in container; `build`: image; `stop`: remove containers, networks (dev DB volume kept)

## Architecture

- Single responsibility, inversion of control, immutability, command pattern, CQRS-like, autowiring DI: `src/application/dependency-injection/container.ts`
- Only `src/configuration/configuration.ts` reads `process.env`
- Newtypes (zod brands)/value objects (Amount bigint, Currency, Timestamp) parse at edge: `src/shared/domain`, feature domain/
- Time from injected Clock, IDs from OrderIdGenerator; adapters never call `new Date()`/`randomUUID()`
- `src/features`: checkout, orders, payments (modular monolith), each: domain, http, application (handler per command/query), infrastructure, one `install-<feature>-feature.ts`
- Ports (CheckoutStore, PaymentStore, OrderReader) wired in `src/bootstrap/install-postgres-stores.ts`. Handlers decide; adapters only query
- `src/infrastructure/postgres`: connection, `migrate.ts`, Drizzle schema, transaction helper, `migrations/001_initial.sql`

## API

`openapi.json` contract (`GET /openapi.json`). Send `Content-Type: application/json`. Body errors before auth: malformed 400, over 16 KiB 413, bad charset/encoding 415. Processing failure 503.

- `POST /checkout-intents`, `GET /orders/<uuid>`: `Authorization: Bearer <API_KEY>` (default `benchmark-api-key`), else 401. Authenticated: shared global in-memory per-process fixed-window limit, 100 per 60000 ms (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`); over: 429 + Retry-After
- `POST /webhooks/payment`: public, no rate limit
- Checkout `{businessOrderReference, amountMinor, currency}` -> order (`id`): new 201; same ref + payload 200; different amount/currency 409, order unchanged. Keyed by ref, Idempotency-Key ignored
- Webhook `{eventId, orderId, outcome: failed|succeeded}` (unknown keys 400): first 200 `{"duplicate":false}`; redelivery `{"duplicate":true}` not applied; unknown order 404
- `amountMinor`: minor-unit string (`"1999"` = 19.99 EUR), not checked against currency digits
- `currency`: ISO 4217 payment currencies only; lowercase, non-ISO, XXX/XAU/XDR etc. 400. List: `openapi.json`, `src/shared/domain/currency.ts`. Stored unknown currency: 503, never served

## Correctness

- Start `pending`; `pending -> failed|succeeded`, `failed -> succeeded`; repeats no-op. Success final
- Late/reordered/conflicting: outcome decides, not arrival order (no provider timestamp); every valid event kept
- Same event ID + same payload (any key order): acked duplicate, applied once. Different payload: 409, not stored/applied. Order checked first: unknown order 404 even if event ID seen, ID not consumed
- Order refs unique service-wide (single merchant), case-sensitive; scope by merchant before production
- `provider_events` append-only log, `orders.status` projection (same tx); no replay at read
- Transitions as data in `src/features/orders/domain/payment-status.ts` + pure fold (max outcome: `pending < failed < succeeded`) -> order-independent; exhaustive tests: `tests/payment-status.test.ts`
- One tx each. Checkout: unique ref + `ON CONFLICT DO NOTHING`, compare payload. Webhook: `SELECT FOR UPDATE` on order (before insert; serialises per order), insert event (unique event ID), compare on conflict, update status
- DB: types, uniqueness, FKs, non-null; no `CHECK`. Value rules in request parsers; stored status, amount, currency re-parsed on read

## Commentary

The scope of this project is tiny so arguably the architectural patterns enforced on it make it _more_ difficult to reason about it. Merging everything into a single file for such a tiny project is definitely the way I would go. These patterns are more relevant as a proof-of-concept for a potentially much larger feature with lots of integrations (different ports, different ways to pay, different ways to notify).

This architecture was applied anyway as a sample of what I'm looking for while making software.

## AI use disclosure

Various LLMs were used during the implementation of this repository, but primarily Opus 5.5, Sonnet 5.5, and GPT6-Sol. The overwhelming majority of code is LLM-generated. LLMs were directed to make corrections and ensure consistent standards instead of editing code by hand.

Here is a rough summary of how LLMs were used:

- they were instructed in how to scaffold this project
- they were given our initial requirements and definitions of done for an initial implementation
- this implementation was gradually refined, in a "just-in-time" manner; an issue was found, we refined it, we moved on to the next issue
- formatting was applied; initial implementation was almost unreadable
- enforcing of some of our coding standards via eslint (can be more thorough)
- architecture: initial implementation was 5 large buckets, project was completely re-architected, drawing from domain-driven design principles
- I identified object/service creation as an issue, so we added a dependency injection container with autowiring support
- database was converted to a dumb store, with checks moving to the application rather than the database, keeping uniqueness, types, or foreign key constraints
- also: LLMs are heavily biased towards UUIDs, which hurt performance; they were redirected to serial keys for internal references
- I thought my idea for an idempotency key was cool, and then I realised it duplicates existing functionality so I removed it
- the postgres store ended up being a god object so it was split apart
- even with autowiring, feature registration was annoying so we added dedicated `install` methods on the container or the `App` so that the central scaffolding is nice and clean
- `provider_events` screamed "event-sourcing" to me so we applied some event-sourcing patterns (primarily the reducer)
- order state transitions were recorded as data in the domain layer, and applied via methods on the domain objects
- correctness was manually verified as guaranteed primarily via a) reasoning through the sensitive code (under payments) and the following tests: `order-lifecycle.test.ts`, `payment-flow.test.ts`
- for additional peace-of-mind, beyond my ability to reason around concurrency, several rounds of adversarial reviewers were used to refine the implementation and enrich tests
- automated mutation testing was added to ensure that our tests are capable of failing; AI was used to kill the mutants up to an acceptable degree (25% or less survival rate)
- I noticed we use `string` too much, so newtypes were introduced to avoid passing the wrong data to the wrong place just because they are all `string`
