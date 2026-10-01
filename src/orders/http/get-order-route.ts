import type { RequestHandler } from 'express';
import type { Bus } from '#src/application/bus';
import { GetOrder } from '#src/orders/domain/get-order';

export class GetOrderRoute {
  constructor(private readonly bus: Bus) {}

  public readonly handle: RequestHandler = async (request, response) => {
    const query = GetOrder.from(request.params);
    response.json(await this.bus.dispatch(query));
  };
}
