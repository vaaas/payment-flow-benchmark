import type { Installer } from '#src/application/installer';
import type { IAutowire } from '#src/application/dependency-injection/i-autowire';

export type Class<T extends object> = Function & { readonly prototype: T };

export class Container {
  public install(installer: Installer<Container>): Container {
    return installer(this);
  }

  private readonly providers = new Map<Function, IAutowire>();
  private readonly instances = new Map<Function, object>();
  private readonly resolving = new Set<Function>();

  public register<T extends object>(
    type: Class<T>,
    provider: IAutowire<NoInfer<T>>,
  ): this {
    this.assertUnregistered(type);
    this.providers.set(type, provider);
    return this;
  }

  public registerInstance<T extends object>(
    type: Class<T>,
    instance: NoInfer<T>,
  ): this {
    this.assertUnregistered(type);
    this.instances.set(type, instance);
    return this;
  }

  public get<T extends object>(type: Class<T>): T {
    const instance = this.instances.get(type);
    if (instance) return instance as T;
    if (this.resolving.has(type)) {
      const path = [...this.resolving, type]
        .map((dependency) => dependency.name)
        .join(' -> ');
      throw new Error(`Circular dependency: ${path}`);
    }
    const provider = this.providers.get(type) ?? this.autowire(type);
    if (!provider) throw new Error(`No provider registered for ${type.name}`);
    this.providers.set(type, provider);
    this.resolving.add(type);
    try {
      const provided = provider.provide(this);
      this.instances.set(type, provided);
      return provided as T;
    } finally {
      this.resolving.delete(type);
    }
  }

  private autowire(type: Function): IAutowire | undefined {
    if ('provide' in type && typeof type.provide === 'function') {
      return type as Function & IAutowire;
    }
    return undefined;
  }

  private assertUnregistered(type: Function): void {
    if (this.providers.has(type) || this.instances.has(type)) {
      throw new Error(`Dependency already registered for ${type.name}`);
    }
  }
}
