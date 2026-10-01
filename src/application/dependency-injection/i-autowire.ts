import type { Container } from '#src/application/dependency-injection/container';

export interface IAutowire<T extends object = object> {
  provide(container: Container): T;
}
