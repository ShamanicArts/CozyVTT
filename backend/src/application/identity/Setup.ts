import type { IdentityUser } from "../../domain/identity/Identity";
import type { AuthenticationService } from "../../ports/AuthenticationService";
import type { SystemSettingsRepository } from "../../ports/SystemSettingsRepository";
import type { Command, CommandHandler } from "../commands/CommandBus";

export const INITIALIZE_SETUP = "identity.setup.initialize" as const;

export class SetupError extends Error {
  constructor(
    readonly error: string,
    message: string,
    readonly errors?: string[],
  ) {
    super(message);
    this.name = "SetupError";
  }
}

export interface InitializeSetupCommand extends Command<IdentityUser> {
  readonly type: typeof INITIALIZE_SETUP;
  readonly input: Record<string, unknown>;
}

export class SetupQueries {
  constructor(private readonly settings: SystemSettingsRepository) {}
  async status() {
    const [settings, userCount] = await Promise.all([
      this.settings.load(),
      this.settings.userCount(),
    ]);
    const hasUsers = userCount > 0;
    return {
      setupCompleted: settings.setupCompleted,
      hasUsers,
      needsSetup: !settings.setupCompleted || !hasUsers,
    };
  }
}

export class InitializeSetup
  implements CommandHandler<InitializeSetupCommand, IdentityUser>
{
  constructor(
    private readonly settings: SystemSettingsRepository,
    private readonly authentication: AuthenticationService,
  ) {}

  async execute(command: InitializeSetupCommand): Promise<IdentityUser> {
    const settings = await this.settings.load();
    if (settings.setupCompleted)
      throw new SetupError(
        "Setup Already Completed",
        "System setup has already been completed",
      );
    if ((await this.settings.userCount()) > 0)
      throw new SetupError(
        "Users Exist",
        "Cannot run setup when users already exist",
      );
    const { email, password, displayName } = command.input;
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof displayName !== "string"
    )
      throw new SetupError(
        "Validation Error",
        "Email, password, and display name are required",
      );
    try {
      const user = await this.authentication.register({
        email,
        password,
        displayName,
      });
      await this.settings.completeSetup();
      return user;
    } catch (error) {
      throw new SetupError(
        "Setup Failed",
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
    }
  }
}
