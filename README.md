# Payment flow benchmark

## Requirements

- docker + compose
- podman + compose

Host does not need node.js, psql, or dev tooling; workloads exist entirely in containers.

## Usage

- `./run dev`: start the dev server at `http://localhost:3000`
- `./run test`: compile and run the test suite
- `./run mutate`: run mutation tests with Stryker. Manual only: it is not part of `./run test` or any build, and takes about 30 minutes. Extra arguments go to `stryker run`, e.g. `./run mutate --mutate src/shared/domain/amount.ts`
- `./run format`: apply `prettier` formatting
- `./run format:check`: read-only formatting check
- `./run npm ...`: forward arguments to npm inside the container, e.g. `./run npm i`
- `./run build`: build the application image.
- `./run stop`: remove service containers and networks

### Mutation testing

`./run mutate` mutates the code under `src/` (except `main.ts`) and re-runs the test suite against each mutant, to check that the tests can fail. It runs serially against the test database in a separate image that adds `procps`, which Stryker needs to stop hung mutants. Mutants that do not compile are discarded by the TypeScript checker. The reports are written to `reports/` (git-ignored): an HTML report at `reports/mutation/index.html`, plus `reports/stryker-incremental.json`, which lets a later run re-test only what changed. The run fails below a 75% mutation score, so at most 25% of mutants may survive. The latest full run scored 89%; the survivors are mostly constant error messages and unused type-tag strings.

## Architecture

Services and volumes for our containers are defined in `compose.yaml`

The main application entrypoing is in `src/main.ts`. We follow an object-oriented style with particular emphasis on the single-responsibility principle, the inversion of control, and immutability.

Project configuration is defined via environment variables. `Configuration.ts` is the only file allowed to read `process.env` directly.

Typescript is used for typechecking with maximum realistic strictness.

Values that encode more than a string or number are newtypes: distinct types with a parser, so they cannot be mixed up or built from unchecked input. Branded primitives (`src/shared/domain/newtype.ts`, built on zod brands) cover:

- identifiers: `OrderId` (lower-cased UUID), `BusinessOrderReference`, `ProviderEventId`
- configuration: `ApiKey`, `DatabaseUrl`, `RequestLimit`, `Milliseconds`
- other: `CurrencyCode`, `MinorUnitDigits`, `HttpStatus`

Value objects cover what needs behavior or its own JSON form: `Amount` (minor units as a bigint), `Currency`, and `Timestamp`. Each parses its wire format at the edge and serializes back to it, so the API is unchanged.

Time and randomness are injected. Handlers take the time from `Clock` and new order IDs from `OrderIdGenerator`, and pass them to the stores. Adapters never call `new Date()` or `randomUUID()`.

`src/infrastructure/postgres` holds cross-cutting database concerns only: the connection (`database.ts`), the schema, migrations, and a generic transaction helper. It contains no business logic.

We use the Command pattern and a CQRS-like architecture to encourage single-action controllers and single-responsibility database operations.

Autowiring dependency injection is supported via the in-house DI framework, found in `src/application/dependency-injection/container.ts`. Object and service creation is encouraged to be autowired.

Barebones bearer authentication is provided as a sample in `src/http/authentication/bearer-authentication.ts`.

Barebones rate-limitting is provided as a sample in `src/http/rate-limiting/rate-limiter.ts`. It is global, not keyed by consumer, and uses a primitive windowing strategy.

Application features are organised in the `src/features` directory. We have 3 features: `checkout`, `orders`, and `payments`. Each feature defines an installer, allowing for straightforward registration of its behavior on our `App` by changing a single line of code.

Every feature is roughly organised into 4 layers:

- domain layer: defines domain objects or data transfer objects (i.e. data structures)
- http layer: the http port of our application (as opposed to, say, websocket ports)
- application layer: where business logic happens, in one handler per command or query
- infrastructure layer: persistence adapters (here, Postgres queries) that implement the feature's port

Each feature owns a narrow persistence port in its domain layer: `CheckoutStore` and `PaymentStore` run work in a transaction through a session of single-purpose operations, and `OrderReader` is the read side. Handlers make the decisions (retry or conflict, status change, duplicate or conflicting event). Adapters only run queries. `src/bootstrap/install-postgres-stores.ts` wires the Postgres adapters.

Feature splitting is excessive for this project as arguably all 3 belong in the same cohesive feature, but the structure shows how a modular monolith could be organised.

## API

Defined in our OpenAPI spec, but very roughly as follows:

### Creating a checkout

```
POST /checkout-intents
Authorization: Bearer your-api-key
Content-Type: application/json

{
    "businessOrderReference": "merchant-123",
    "amountMinor": "1999",
    "currency": "EUR"
}
```

The response includes an `id` (UUID). A new order returns `201`. A retry with the same reference and a matching payload returns the existing order with `200` and creates nothing. The same reference with a different amount or currency returns `409` and leaves the existing order unchanged.

Retries are recognised by `businessOrderReference` alone. There is no idempotency key, and an `Idempotency-Key` header is ignored.

### Currency

`amountMinor` is a string of minor units. `"1999"` is 19.99 EUR. The number of decimal places depends on the currency: `JPY` has 0, `EUR` has 2, `BHD` has 3.

`currency` must be an ISO 4217 code such as `EUR`, `JPY` or `XOF`. Anything else, including lowercase, `ZZZ`, or a non-ISO code, returns `400`. Codes that are not payment currencies are also rejected: `XXX`, `XTS`, precious metals (`XAU`, `XAG`, `XPD`, `XPT`), `XDR`, bond units (`XBA`–`XBD`), `XSU` and `XUA`. The accepted codes are listed in the OpenAPI spec.

Codes are parsed by the `Currency` domain object in `src/shared/domain/currency.ts`, which uses the [`currency-codes`](https://www.npmjs.com/package/currency-codes) package. It also holds each currency's minor-unit digits. The service does not yet check that an amount fits those digits. A stored order with an unknown currency is a processing failure (`503`), never served.

The package data is dated 2024-06. Update the package to follow later ISO changes.

### Simulating the provider's payment via webhook:

```
POST /webhooks/payment
Content-Type: application/json

{
    "eventId": "evt-1",
    "orderId": "<the-previous-uuid>",
    "outcome": "succeeded"
}
```

First delivery returns `200` with `{"duplicate":false}`. An identical redelivery returns `200` with `{"duplicate":true}` and applies nothing. An unknown order returns `404`.

### Reading the result

```
GET /orders/<the-previous-uuid>
Authorization: Bearer your-api-key
```

## Correctness and transactions

Orders start `pending`.

Allowed transitions:

- `pending → failed`
- `pending → succeeded`
- `failed → succeeded`

Repeated statuses are no-ops. Success is permanent (no transition out of success exists). Failure may be corrected by later success, even with an earlier provider timestamp. Every distinct valid event is retained, including ignored failures after success. Identical payload means the validated fields match, regardless of JSON key order.

### Events and status

`provider_events` is an append-only log of what the provider reported. `orders.status` is a projection of that log, updated in the same transaction as the event, so a webhook is acknowledged only after both are committed and a read straight after sees the new status. This is not full event sourcing: orders are ordinary rows, and nothing is derived by replay at read time.

The allowed transitions are declared as data in `src/features/orders/domain/payment-status.ts`, next to a pure fold over outcomes. `Order.applyOutcome(outcome, at)` applies one event and returns the same order when nothing changes, so only a real change is written and `updatedAt` moves only then.

The fold is the highest outcome seen (`pending < failed < succeeded`). It is therefore independent of arrival order, unchanged by redelivery, and the same whether applied one event at a time or all at once. Property tests check these, and database tests check that every stored status equals the fold of its stored events and that the projection can be rebuilt from the log alone. This is what would make processing safe to parallelise within one order later; today a row lock per order serialises it.

### Business order references

References are unique across the whole service, which serves a single merchant. They are case-sensitive. Before production, scope them by merchant.

### Webhook event policy

Events can arrive late, out of order, or more than once, and different event IDs can report conflicting outcomes. The outcome decides, not arrival order or provider timestamps:

- `succeeded` is final. Later events are stored but never change it.
- `failed` can become `succeeded`, because a provider may report a failure and then succeed on retry.
- The same event ID with an identical payload is a duplicate. It is acknowledged and applied once.
- The same event ID with a different payload (another outcome or another order) returns `409`. It is not stored and not applied.
- The order is checked first. An unknown order returns `404`, even if the event ID was used before. The event ID is not consumed.

Checkouts insert-on-conflict and perform payload comparison in one transaction. We use a unique reference constraint to choose one winner under concurrent requests. The next read sees the winner. Mismatches roll back.

Each webhook locks its order with `SELECT FOR UPDATE`, inserts its event using the unique event ID, compares payload on conflict, and updates status in the same transaction. Locking before insertion also avoids foreign-key deadlocks between events on one order.

Different orders can process concurrently. An event ID reused for another existing order or outcome is rejected, never reapplied. The immutable `Order` chooses status changes in the application while its row is locked. The payment session updates only status and `updatedAt`; checkout fields have no update operation. The database enforces uniqueness, foreign keys, and non-null columns only. Value rules (lengths, amount range, currency format, outcomes) live in the request parsers, and stored statuses are parsed again when read. There are no `CHECK` constraints and no transition trigger.

## Commentary

The scope of this project is tiny so arguably the architectural patterns enforced on it make it *more* difficult to reason about it. Merging everything into a single file for such a tiny project is definitely the way I would go. These patterns are more relevant as a proof-of-concept for a potentially much larger feature with lots of integrations (different ports, different ways to pay, different ways to notify).

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
