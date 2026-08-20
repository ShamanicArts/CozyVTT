import { authenticateUser, registerUser } from "../../services/auth";
import { AuthenticationService } from "../../ports/AuthenticationService";
import { IdentityUser } from "../../domain/identity/Identity";

export class LegacyAuthenticationService implements AuthenticationService {
  async register(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<IdentityUser> {
    return (await registerUser(input)) as IdentityUser;
  }
  async authenticate(input: {
    email: string;
    password: string;
    rememberMe?: boolean;
  }): Promise<IdentityUser | null> {
    return (await authenticateUser(input)) as IdentityUser | null;
  }
}
