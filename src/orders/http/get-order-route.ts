import type { RequestHandler } from 'express';
import type { QueryBus } from '#src/application/query-bus';
import { GetOrder } from '#src/orders/domain/get-order';

export class GetOrderRoute {
  constructor(private readonly queries: QueryBus) {}

  public readonly handle: RequestHandler = async (request, response) => {
    const query = GetOrder.from(request.params);
    response.json(await this.queries.dispatch(query));
  };
}
