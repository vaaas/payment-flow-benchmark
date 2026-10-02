import { Timestamp } from '#src/shared/domain/timestamp';

export class Clock {
  public static provide(): Clock {
    return new Clock();
  }

  public now(): Timestamp {
    return Timestamp.of(new Date());
  }
}
