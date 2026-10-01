import type { Installer } from '#src/application/installer';
import type { Event, EventType } from '#src/application/event';
import type { EventHandler } from '#src/application/event-handler';

export class Bus {
  public install(installer: Installer<Bus>): Bus {
    return installer(this);
  }

  private readonly handlers = new Map<
    Function,
    (event: Event<unknown>) => Promise<unknown>
  >();

  public on<E extends Event<unknown>>(
    eventType: EventType<E>,
    handler: EventHandler<NoInfer<E>>,
  ): this {
    if (this.handlers.has(eventType)) {
      throw new Error(`Handler already registered for ${eventType.name}`);
    }
    this.handlers.set(eventType, (event) => handler.handle(event as E));
    return this;
  }

  public async dispatch<T = void>(event: Event<T>): Promise<T> {
    const handler = this.handlers.get(event.constructor);
    if (!handler)
      throw new Error(`No handler registered for ${event.constructor.name}`);
    return (await handler(event)) as T;
  }
}
