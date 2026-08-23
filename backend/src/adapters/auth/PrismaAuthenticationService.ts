import type { PrismaClient } from "@prisma/client";
import type { IdentityUser } from "../../domain/identity/Identity";
import type { AuthenticationService } from "../../ports/AuthenticationService";
import type { PasswordHasher } from "../../ports/PasswordHasher";
import {
  sanitizeInput,
  validateEmail,
  validatePasswordStrength,
} from "../../utils/validation";

export class PrismaAuthenticationService implements AuthenticationService {
  constructor(
    private readonly client: PrismaClient,
    private readonly passwords: PasswordHasher,
  ) {}
  async register(input: { email: string; password: string; displayName: string }): Promise<IdentityUser> {
    if (!validateEmail(input.email)) throw new Error("Invalid email format");
    const validation = validatePasswordStrength(input.password);
    if (!validation.valid) throw new Error(validation.errors.join(", "));
    const email = sanitizeInput(input.email.toLowerCase());
    if (await this.client.user.findUnique({ where: { email } }))
      throw new Error("Email already registered");
    return this.client.user.create({
      data: {
        email,
        passwordHash: await this.passwords.hash(input.password),
        displayName: sanitizeInput(input.displayName),
        platformRole: (await this.client.user.count()) === 0 ? "ADMIN" : "USER",
      },
    });
  }
  async authenticate(input: { email: string; password: string }): Promise<IdentityUser | null> {
    const user = await this.client.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (!user || !(await this.passwords.verify(user.passwordHash, input.password)))
      return null;
    await this.client.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return user;
  }
}
