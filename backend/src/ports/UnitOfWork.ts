/**
 * Executes a unit of work atomically when the underlying adapter supports
 * transactions. Application code deliberately does not receive a database
 * client; transaction-aware adapters resolve it from their ambient context.
 */
export interface UnitOfWorkPort {
  execute<T>(work: () => Promise<T>): Promise<T>;
}
