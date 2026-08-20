import { Command, CommandHandler } from "../commands/CommandBus";
import { IdentityError, IdentityUser } from "../../domain/identity/Identity";
import { AuthenticationService } from "../../ports/AuthenticationService";
import { RegistrationPolicy } from "../../ports/RegistrationPolicy";

export const REGISTER_ACCOUNT = "identity.register" as const;
export const LOGIN_ACCOUNT = "identity.login" as const;

export interface RegisterAccountCommand extends Command<{
  user: IdentityUser;
  pendingApproval: boolean;
}> {
  readonly type: typeof REGISTER_ACCOUNT;
  readonly input: Record<string, unknown>;
}
export interface LoginAccountCommand extends Command<IdentityUser> {
  readonly type: typeof LOGIN_ACCOUNT;
  readonly input: Record<string, unknown>;
}

export class RegisterAccount implements CommandHandler<
  RegisterAccountCommand,
  { user: IdentityUser; pendingApproval: boolean }
> {
  constructor(
    private readonly auth: AuthenticationService,
    private readonly policy: RegistrationPolicy,
  ) {}
  async execute(
    command: RegisterAccountCommand,
  ): Promise<{ user: IdentityUser; pendingApproval: boolean }> {
    const { email, password, displayName } = command.input;
    if (!email || !password || !displayName)
      throw new IdentityError(
        400,
        "Validation Error",
        "Email, password, and display name are required",
      );
    const isFirstUser = (await this.policy.userCount()) === 0;
    if (!isFirstUser) {
      const settings = await this.policy.settings();
      if (!settings.allowRegistration)
        throw new IdentityError(
          403,
          "Registration Disabled",
          "Registration is currently disabled. Please contact an administrator.",
        );
      const user = await this.auth.register({
        email: email as string,
        password: password as string,
        displayName: displayName as string,
      });
      if (settings.requireAdminApproval) {
        await this.policy.setApproval(user.id, false);
        return { user, pendingApproval: true };
      }
      return { user, pendingApproval: false };
    }
    return {
      user: await this.auth.register({
        email: email as string,
        password: password as string,
        displayName: displayName as string,
      }),
      pendingApproval: false,
    };
  }
}

export class LoginAccount implements CommandHandler<
  LoginAccountCommand,
  IdentityUser
> {
  constructor(private readonly auth: AuthenticationService) {}
  async execute(command: LoginAccountCommand): Promise<IdentityUser> {
    const { email, password, rememberMe } = command.input;
    if (!email || !password)
      throw new IdentityError(
        400,
        "Validation Error",
        "Email and password are required",
      );
    const user = await this.auth.authenticate({
      email: email as string,
      password: password as string,
      rememberMe: rememberMe as boolean | undefined,
    });
    if (!user)
      throw new IdentityError(
        401,
        "Authentication Failed",
        "Invalid email or password",
      );
    if (!user.isApproved)
      throw new IdentityError(
        403,
        "Account Pending Approval",
        "Your account is pending admin approval. Please contact an administrator.",
      );
    return user;
  }
}
