export interface ManagedUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  platformRole: "ADMIN" | "USER";
  preferences: unknown;
}

export class UserMutationError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 503,
    public readonly error: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "UserMutationError";
  }
}
