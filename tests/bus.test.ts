import { Bus } from '#src/application/bus';
import { Event } from '#src/application/event';

class ReadName extends Event<string> {
  constructor(public readonly id: number) {
    super();
  }
}

class ReadCount extends Event<number> {}
class Notify extends Event {}

test('chained registration dispatches unrelated event types with inferred results', async () => {
  const bus = new Bus()
    .on(ReadName, { handle: async (event) => `order-${event.id}` })
    .on(ReadCount, { handle: async () => 3 })
    .on(Notify, { handle: async () => {} });
  const name: Promise<string> = bus.dispatch(new ReadName(7));
  const count: Promise<number> = bus.dispatch(new ReadCount());
  const notified: Promise<void> = bus.dispatch(new Notify());
  expect(await name).toBe('order-7');
  expect(await count).toBe(3);
  expect(await notified).toBeUndefined();
});

test('duplicate registration rejects without replacing the original handler', async () => {
  const bus = new Bus().on(ReadCount, { handle: async () => 3 });
  expect(() => bus.on(ReadCount, { handle: async () => 9 })).toThrow(
    'Handler already registered for ReadCount',
  );
  expect(await bus.dispatch(new ReadCount())).toBe(3);
});

test('unregistered event dispatch rejects', async () => {
  await expect(new Bus().dispatch(new ReadCount())).rejects.toThrow(
    'No handler registered for ReadCount',
  );
});

test('dispatch awaits completion and propagates the original failure', async () => {
  const failure = new Error('Store unavailable');
  let reject!: (error: Error) => void;
  const pending = new Promise<number>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  const bus = new Bus().on(ReadCount, { handle: () => pending });
  const response = bus.dispatch(new ReadCount());
  const assertion = expect(response).rejects.toBe(failure);
  reject(failure);
  await assertion;
});

test('synchronous handler failures also become rejected dispatch promises', async () => {
  const failure = new Error('Handler failed');
  const bus = new Bus().on(ReadCount, {
    handle: () => {
      throw failure;
    },
  });
  await expect(bus.dispatch(new ReadCount())).rejects.toBe(failure);
});
