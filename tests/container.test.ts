import { Container } from '#src/application/dependency-injection/container';
import type { IAutowire } from '#src/application/dependency-injection/i-autowire';

class Dependency {}
class Consumer {
  public static provide(container: Container): Consumer {
    return new Consumer(container.get(Dependency));
  }

  constructor(public readonly dependency: Dependency) {}
}

test('explicit providers and static autowiring share cached singleton dependencies', () => {
  const provide = jest.fn(() => new Dependency());
  const provider: IAutowire<Dependency> = { provide };
  const autowire: IAutowire<Consumer> = Consumer;
  const container = new Container().register(Dependency, provider);
  const consumer = container.get(Consumer);
  expect(autowire).toBe(Consumer);
  expect(container.get(Consumer)).toBe(consumer);
  expect(container.get(Dependency)).toBe(consumer.dependency);
  expect(provide).toHaveBeenCalledTimes(1);
  expect(provide).toHaveBeenCalledWith(container);
});

test('registered instances override static autowiring and stay container scoped', () => {
  const instance = new Consumer(new Dependency());
  const container = new Container().registerInstance(Consumer, instance);
  expect(container.get(Consumer)).toBe(instance);
  const other = new Container().register(Dependency, {
    provide: () => new Dependency(),
  });
  expect(other.get(Consumer)).not.toBe(instance);
});

test('an explicit provider takes precedence over a static provider', () => {
  const instance = new Consumer(new Dependency());
  const container = new Container().register(Consumer, {
    provide: () => instance,
  });
  expect(container.get(Consumer)).toBe(instance);
});

test('missing providers fail without silently constructing dependencies', () => {
  expect(() => new Container().get(Dependency)).toThrow(
    'No provider registered for Dependency',
  );
});

test('duplicate registrations cannot replace resolved or registered dependencies', () => {
  const container = new Container().register(Dependency, {
    provide: () => new Dependency(),
  });
  expect(() =>
    container.register(Dependency, { provide: () => new Dependency() }),
  ).toThrow('Dependency already registered for Dependency');
  container.get(Dependency);
  expect(() =>
    container.registerInstance(Dependency, new Dependency()),
  ).toThrow('Dependency already registered for Dependency');
  container.get(Consumer);
  expect(() => container.register(Consumer, Consumer)).toThrow(
    'Dependency already registered for Consumer',
  );
});

test('provider failures are not cached and resolution can be retried', () => {
  const failure = new Error('Temporary failure');
  const instance = new Dependency();
  const provide = jest
    .fn()
    .mockImplementationOnce(() => {
      throw failure;
    })
    .mockReturnValue(instance);
  const container = new Container().register(Dependency, { provide });
  expect(() => container.get(Dependency)).toThrow(failure);
  expect(container.get(Dependency)).toBe(instance);
  expect(container.get(Dependency)).toBe(instance);
  expect(provide).toHaveBeenCalledTimes(2);
});

test('circular dependencies report the resolution path and clear pending resolution', () => {
  class First {
    public static provide(container: Container): First {
      container.get(Second);
      return new First();
    }
  }
  class Second {
    public static provide(container: Container): Second {
      container.get(First);
      return new Second();
    }
  }
  const container = new Container();
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(() => container.get(First)).toThrow(
      'Circular dependency: First -> Second -> First',
    );
  }
});
