import * as isoCurrencies from 'currency-codes';
import { z } from 'zod';

const nonCurrencyCodes = new Set([
  'XXX',
  'XTS',
  'XAU',
  'XAG',
  'XPD',
  'XPT',
  'XDR',
  'XBA',
  'XBB',
  'XBC',
  'XBD',
  'XSU',
  'XUA',
]);

export class Currency {
  private static readonly known = new Map<string, Currency>(
    isoCurrencies.data
      .filter((record) => !nonCurrencyCodes.has(record.code))
      .map((record) => [record.code, new Currency(record.code, record.digits)]),
  );

  public static readonly schema = z.string().transform((code, context) => {
    const currency = Currency.known.get(code);
    if (!currency) {
      context.addIssue({
        code: 'custom',
        message: 'Must be an ISO 4217 currency code',
      });
      return z.NEVER;
    }
    return currency;
  });

  public static of(code: string): Currency {
    const currency = Currency.known.get(code);
    if (!currency) throw new Error(`Unknown currency code ${code}`);
    return currency;
  }

  public static codes(): string[] {
    return [...Currency.known.keys()].sort();
  }

  private constructor(
    public readonly code: string,
    public readonly minorUnitDigits: number,
  ) {
    Object.freeze(this);
  }

  public equals(other: Currency): boolean {
    return this.code === other.code;
  }

  public toString(): string {
    return this.code;
  }

  public toJSON(): string {
    return this.code;
  }
}
