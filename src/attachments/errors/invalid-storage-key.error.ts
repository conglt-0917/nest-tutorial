export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Invalid storage key: ${key}`);
    this.name = InvalidStorageKeyError.name;
  }
}
