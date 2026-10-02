import { z } from 'zod';

export class Amount {
  private static readonly maximum = 9223372036854775807n;

  public static readonly schema = z
    .string()
    .regex(/^[1-9][0-9]{0,18}$/)
    .transform((digits, context) => {
      const minorUnits = BigInt(digits);
      if (minorUnits > Amount.maximum) {
        context.addIssue({
          code: 'custom',
          message: 'Amount exceeds the largest supported value',
        });
        return z.NEVER;
      }
      return new Amount(minorUnits);
    });

  public static of(minorUnits: bigint): Amount {
    if (minorUnits < 1n || minorUnits > Amount.maximum)
      throw new Error(`Amount out of range: ${minorUnits}`);
    return new Amount(minorUnits);
  }

  private constructor(public readonly minorUnits: bigint) {
    Object.freeze(this);
  }

  public equals(other: Amount): boolean {
    return this.minorUnits === other.minorUnits;
  }

  public toString(): string {
    return this.minorUnits.toString();
  }

  public toJSON(): string {
    return this.toString();
  }
}
