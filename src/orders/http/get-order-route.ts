import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import type { QueryBus } from '../../application/query-bus';
import { GetOrder } from '../domain/get-order';

export class GetOrderRoute {
  private readonly parametersSchema = z.object({ id: z.uuid() });

  constructor(private readonly queries: QueryBus) {}

  public readonly handle: RequestHandler = async (request, response) => {
    const query = this.parse(request);
    response.json(await this.queries.dispatch(query));
  };

  private parse(request: Request): GetOrder {
    const { id } = this.parametersSchema.parse(request.params);
    return new GetOrder(id);
  }
}
