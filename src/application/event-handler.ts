import type { Event, EventResult } from '#src/application/event';

export interface EventHandler<E extends Event<unknown>> {
  handle(event: E): Promise<EventResult<E>>;
}
