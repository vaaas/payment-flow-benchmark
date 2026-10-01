import type { Container } from '#src/application/dependency-injection/container';
import type { RequestHandler } from 'express';
import { Bus } from '#src/application/bus';
import { GetOrder } from '#src/features/orders/domain/get-order';

export class GetOrderRoute {
  public static provide(container: Container): GetOrderRoute {
    return new GetOrderRoute(container.get(Bus));
  }

  constructor(private readonly bus: Bus) {}

  public readonly handle: RequestHandler = async (request, response) => {
    const query = GetOrder.from(request.params);
    response.json(await this.bus.dispatch(query));
  };
}
