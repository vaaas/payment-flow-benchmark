import express, { Express } from 'express';
import type { CommandBus } from '../application/command-bus';
import type { QueryBus } from '../application/query-bus';
import { CreateCheckoutRoute } from '../checkout/http/create-checkout-route';
import { GetOrderRoute } from '../orders/http/get-order-route';
import { ReceiveWebhookRoute } from '../payments/http/receive-webhook-route';
import { ErrorHandler } from './error-handler';
import { NotFoundRoute } from './not-found-route';
import { OpenApiRoute } from './openapi-route';

export class App {
  public readonly http: Express;

  constructor(commands: CommandBus, queries: QueryBus) {
    this.http = express();
    this.http.use(express.json({ limit: '16kb' }));
    this.http.get('/openapi.json', new OpenApiRoute().handle);
    this.http.post(
      '/checkout-intents',
      new CreateCheckoutRoute(commands).handle,
    );
    this.http.post(
      '/webhooks/payment',
      new ReceiveWebhookRoute(commands).handle,
    );
    this.http.get('/orders/:id', new GetOrderRoute(queries).handle);
    this.http.use(new NotFoundRoute().handle);
    this.http.use(new ErrorHandler().handle);
  }

  public listen(port = 3000, host = '0.0.0.0') {
    return this.http.listen(port, host);
  }
}
