import { IdentityUser } from "../domain/identity/Identity";

export interface AuthenticationService {
  register(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<IdentityUser>;
  authenticate(input: {
    email: string;
    password: string;
    rememberMe?: boolean;
  }): Promise<IdentityUser | null>;
}
