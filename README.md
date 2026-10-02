# Payment flow benchmark

## Requirements

- docker + compose
- podman + compose

Host does not need node.js, psql, or dev tooling; workloads exist entirely in containers.

## Usage

- `./run dev`: start the dev server at `http://localhost:3000`
- `./run test`: compile and run the test suite
- `./run format`: apply `prettier` formatting
- `./run format:check`: read-only formatting check
- `./run npm ...`: forward arguments to npm inside the container, e.g. `./run npm i`
- `./run build`: build the application image.
- `./run stop`: remove service containers and networks

## Architecture

Services and volumes for our containers are defined in `compose.yaml`

The main application entrypoing is in `src/main.ts`. We follow an object-oriented style with particular emphasis on the single-responsibility principle, the inversion of control, and immutability.

Project configuration is defined via environment variables. `Configuration.ts` is the only file allowed to read `process.env` directly.

Typescript is used for typechecking with maximum realistic strictness.

Database initialisation is encapsulated under `infrastructure/postgres/database.ts`

We use the Command pattern and a CQRS-like architecture to encourage single-action controllers and single-responsibility database operations.

Autowiring dependency injection is supported via the in-house DI framework, found in `src/application/dependency-injection/container.ts`. Object and service creation is encouraged to be autowired.

Barebones bearer authentication is provided as a sample in `src/http/authentication/bearer-authentication.ts`.

Barebones rate-limitting is provided as a sample in `src/http/rate-limiting/rate-limiter.ts`. It is global, not keyed by consumer, and uses a primitive windowing strategy.

Application features are organised in the `src/features` directory. We have 3 features: `checkout`, `orders`, and `payments`. Each feature defines an installer, allowing for straightforward registration of its behavior on our `App` by changing a single line of code.

Every feature is roughly organised into 3 layers:
- domain layer: defines domain objects or data transfer objects (i.e. data structures)
- http layer: the http port of our application (as opposed to, say, websocket ports)
- application layer: where business logic happens

Feature splitting is excessive for this project as arguably all 3 belong in the same cohesive feature, but the structure shows how a modular monolith could be organised.

## API

Defined in our OpenAPI spec, but very roughly as follows:


### Creating a checkout

```
POST /checkout-intents
Authorization: Bearer your-api-key
Content-Type: application/json
Idempotency-Key: some-contrived-key

{
    "businessOrderReference": "merchant-123",
    "amountMinor": "1999",
    "currency": "EUR"
}
```

The response includes an `id` (UUID).

Note that we accept an optional idempotency key, allowed to be any contrived string defined by our consumer. For example, one may send `<userId>-<YYYY-MM-dd>`. This is a safety measure to prevent double writes. In the case of double writes, the first one simply wins.

### Simulating the provider's payment via webhook:

```
POST /webhooks/payment
Content-Type: application/json

{
    {
        "eventId": "evt-1",
        "orderId": <the-previous-uuid>,
        "outcome": "succeeded"
    }
}
```

### Reading the result

```
GET /orders/<the-previous-uuid>
Authorization: your-api-key
```

## Correctness and transactions

Orders start `pending`.

Allowed transitions:
- `pending → failed`
- `pending → succeeded`
- `failed → succeeded`

Repeated statuses are no-ops. Success is permanent (no transition out of success exists). Failure may be corrected by later success, even with an earlier provider timestamp. Every distinct valid event is retained, including ignored failures after success. Identical payload means the validated fields match, regardless of JSON key order.

Checkouts insert-on-conflict and perform payload comparison in one transaction. We use a unique reference constraint to choose one winder under concurrent requests. The next read sees the winner. Mismatches roll back.

Each webhook locks its order with `SELECT FOR UPDATE`, inserts its event using the unique event ID, compares payload on conflict, and updates status in the same transaction. Locking before insertion also avoids foreign-key deadlocks between events on one order.

Different orders can process concurrently. An event ID reused for another existing order or outcome is rejected, never reapplied. The immutable `Order` chooses status changes in the application while its row is locked. The store updates only status and `updatedAt`; checkout fields have no update operation. The database enforces uniqueness, foreign keys, and value checks, but no transition trigger.