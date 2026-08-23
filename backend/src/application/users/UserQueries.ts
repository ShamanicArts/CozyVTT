import type {
  UserQueryRecord,
  UserQueryRepository,
} from "../../ports/UserQueryRepository";

export class UserQueryError extends Error {
  constructor(
    readonly status: 403 | 404,
    readonly error: "Forbidden" | "Not Found",
    message: string,
  ) {
    super(message);
    this.name = "UserQueryError";
  }
}

export class UserQueries {
  constructor(private readonly users: UserQueryRepository) {}

  async list() {
    return Promise.all((await this.users.list()).map(publicUser));
  }

  async find(input: {
    actorId: string;
    isAdmin: boolean;
    userId: string;
  }) {
    this.authorize(input);
    const user = await this.users.find(input.userId);
    if (!user) throw new UserQueryError(404, "Not Found", "User not found");
    return publicUser(user);
  }

  async preferences(input: {
    actorId: string;
    isAdmin: boolean;
    userId: string;
  }) {
    this.authorize(input, "view this user's preferences");
    const user = await this.users.find(input.userId);
    if (!user) throw new UserQueryError(404, "Not Found", "User not found");
    return user.preferences ?? {};
  }

  async current(userId: string) {
    const user = await this.users.find(userId);
    return user ? publicUser(user) : null;
  }

  private authorize(
    input: { actorId: string; isAdmin: boolean; userId: string },
    action = "view this user",
  ) {
    if (input.actorId !== input.userId && !input.isAdmin)
      throw new UserQueryError(
        403,
        "Forbidden",
        `You do not have permission to ${action}`,
      );
  }
}

export function publicUser(user: UserQueryRecord): Record<string, unknown> {
  const { passwordHash, mfaSecret, mfaBackupCodes, ...publicFields } = user;
  return publicFields;
}
