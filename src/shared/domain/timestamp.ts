import { z } from 'zod';

export class Timestamp {
  public static readonly schema = z.iso
    .datetime()
    .transform((value) => Timestamp.of(new Date(value)));

  public static of(date: Date): Timestamp {
    const epochMilliseconds = date.getTime();
    if (Number.isNaN(epochMilliseconds))
      throw new Error('Timestamp requires a valid date');
    return new Timestamp(epochMilliseconds);
  }

  private constructor(public readonly epochMilliseconds: number) {
    Object.freeze(this);
  }

  public toDate(): Date {
    return new Date(this.epochMilliseconds);
  }

  public equals(other: Timestamp): boolean {
    return this.epochMilliseconds === other.epochMilliseconds;
  }

  public isBefore(other: Timestamp): boolean {
    return this.epochMilliseconds < other.epochMilliseconds;
  }

  public toString(): string {
    return this.toDate().toISOString();
  }

  public toJSON(): string {
    return this.toString();
  }
}
