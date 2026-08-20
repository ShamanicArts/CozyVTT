export interface IdentityUser {
  id: string;
  email: string;
  displayName: string;
  platformRole: "ADMIN" | "USER";
  isApproved: boolean;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
}

export class IdentityError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404,
    public readonly error: string,
    message: string,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}
