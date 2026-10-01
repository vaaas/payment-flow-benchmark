import express, { Express } from 'express';
import type { Bus } from '#src/application/bus';
import { CreateCheckoutRoute } from '#src/checkout/http/create-checkout-route';
import { GetOrderRoute } from '#src/orders/http/get-order-route';
import { ReceiveWebhookRoute } from '#src/payments/http/receive-webhook-route';
import { ErrorHandler } from '#src/http/error-handler';
import { NotFoundRoute } from '#src/http/not-found-route';
import { OpenApiRoute } from '#src/http/openapi-route';

export class App {
  public readonly http: Express;

  constructor(bus: Bus) {
    this.http = express();
    this.http.use(express.json({ limit: '16kb' }));
    this.http.get('/openapi.json', new OpenApiRoute().handle);
    this.http.post('/checkout-intents', new CreateCheckoutRoute(bus).handle);
    this.http.post('/webhooks/payment', new ReceiveWebhookRoute(bus).handle);
    this.http.get('/orders/:id', new GetOrderRoute(bus).handle);
    this.http.use(new NotFoundRoute().handle);
    this.http.use(new ErrorHandler().handle);
  }

  public listen(port = 3000, host = '0.0.0.0') {
    return this.http.listen(port, host);
  }
}
