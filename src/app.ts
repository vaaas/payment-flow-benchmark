import express, { ErrorRequestHandler } from 'express';
import { z } from 'zod';
import openApiSpec from '../openapi.json';
import { CommandBus, CreateCheckout, GetOrder, HttpError, QueryBus, ReceiveWebhook } from './domain';
const identifier = z.string().min(1).max(128).refine(value => value.trim() === value);
const checkoutSchema = z.strictObject({
  businessOrderReference: identifier,
  amountMinor: z.string().regex(/^[1-9][0-9]{0,18}$/).pipe(z.string().refine(value => BigInt(value) <= 9223372036854775807n)),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
const eventSchema = z.strictObject({ eventId: identifier, orderId: z.uuid(), outcome: z.enum(['failed', 'succeeded']) });
export function createApp(commands: CommandBus, queries: QueryBus) {
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.get('/openapi.json', (_req, res) => { res.json(openApiSpec); });
  app.post('/checkout-intents', async (req, res) => {
    const result = await commands.dispatch(new CreateCheckout(checkoutSchema.parse(req.body)));
    res.status(result.created ? 201 : 200).json(result.order);
  });
  app.post('/webhooks/payment', async (req, res) => {
    res.json(await commands.dispatch(new ReceiveWebhook(eventSchema.parse(req.body))));
  });
  app.get('/orders/:id', async (req, res) => {
    res.json(await queries.dispatch(new GetOrder(z.uuid().parse(req.params.id))));
  });
  app.use((_req, res) => { res.status(404).json({ error: 'Route not found' }); });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Invalid request', details: error.issues }); return; }
    if (error instanceof HttpError) { res.status(error.status).json({ error: error.message }); return; }
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') { res.status(error.status).json({ error: 'Invalid JSON body' }); return; }
    console.error(error);
    res.status(503).json({ error: 'Processing failed; retry the identical request' });
  };
  app.use(errors);
  return app;
}
