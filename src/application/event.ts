declare const eventResult: unique symbol;

export abstract class Event<T = void> {
  declare readonly [eventResult]: T;
}

export type EventType<E extends Event<unknown>> = Function & {
  readonly prototype: E;
};

export type EventResult<E extends Event<unknown>> = E[typeof eventResult];
