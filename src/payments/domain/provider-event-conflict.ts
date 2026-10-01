export class ProviderEventConflict extends Error {
  constructor() {
    super('Provider event ID already has a different payload');
  }
}
