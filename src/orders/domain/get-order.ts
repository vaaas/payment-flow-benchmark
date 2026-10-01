export class GetOrder {
  constructor(public readonly id: string) {
    Object.freeze(this);
  }
}
