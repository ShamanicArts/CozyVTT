import {
  DeleteUserAsAdmin,
  SendUserPasswordResetLink,
  UpdateUserPreferences,
  UpdateUserProfile,
} from "./UserMutations";
import { UserMutationRepository } from "../../ports/UserMutationRepository";
import { PasswordResetNotifier } from "../../ports/PasswordResetNotifier";

function users(): jest.Mocked<UserMutationRepository> {
  return {
    findUser: jest.fn(async (id: string) => ({
      id,
      email: "mira@example.com",
      displayName: "Mira",
      passwordHash: "hash",
      platformRole: "USER" as const,
      preferences: { themeId: "cozy-default" },
    })),
    findUserByEmail: jest.fn(async (_email: string) => null),
    updateUser: jest.fn(async (_id: string, input) => ({
      id: "user-1",
      ...input,
    })),
    findPreferences: jest.fn(async (_id: string) => ({
      exists: true,
      preferences: { themeId: "cozy-default" },
    })),
    updatePreferences: jest.fn(async (_id: string, preferences) => ({
      id: "user-1",
      preferences,
    })),
    countUserAssets: jest.fn(async (_id: string) => 3),
    deleteUser: jest.fn(async (_id: string) => undefined),
    invalidateUnusedPasswordResetTokens: jest.fn(
      async (_id: string) => undefined,
    ),
    createPasswordResetToken: jest.fn(
      async (_userId: string, _token: string, _expiresAt: Date) => undefined,
    ),
  };
}

const notifier: jest.Mocked<PasswordResetNotifier> = {
  isConfigured: jest.fn(() => true),
  send: jest.fn(
    async (_email: string, _token: string, _displayName: string) => undefined,
  ),
};

describe("user mutation commands", () => {
  it("keeps profile authorization, normalization, and admin-only fields in the command", async () => {
    const repository = users();
    const updated = await new UpdateUserProfile(repository).execute({
      type: "user.update-profile",
      actorId: "user-1",
      isAdmin: false,
      userId: "user-1",
      input: {
        displayName: "  Mira  ",
        email: "MIRA@EXAMPLE.COM",
        bio: "  hello  ",
      },
    });
    expect(updated).toMatchObject({
      displayName: "Mira",
      email: "mira@example.com",
      bio: "hello",
    });
    await expect(
      new UpdateUserProfile(repository).execute({
        type: "user.update-profile",
        actorId: "user-1",
        isAdmin: false,
        userId: "user-2",
        input: {},
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: "You do not have permission to update this user",
    });
  });

  it("merges valid preference payloads and keeps parse errors transport-mappable", async () => {
    const repository = users();
    const updated = await new UpdateUserPreferences(repository).execute({
      type: "user.update-preferences",
      actorId: "user-1",
      isAdmin: false,
      userId: "user-1",
      input: { fontId: "modern" },
    });
    expect(updated).toMatchObject({
      preferences: { themeId: "cozy-default", fontId: "modern" },
    });
    await expect(
      new UpdateUserPreferences(repository).execute({
        type: "user.update-preferences",
        actorId: "user-1",
        isAdmin: false,
        userId: "user-1",
        input: { fontId: "huge" },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Invalid preferences payload",
    });
  });

  it("accepts only themes contributed by active extensions", async () => {
    const repository = users();
    const themes = {
      hasActiveTheme: jest.fn(
        async (id: string) => id === "example.theme-package-night",
      ),
    };
    await expect(
      new UpdateUserPreferences(repository, themes).execute({
        type: "user.update-preferences",
        actorId: "user-1",
        isAdmin: false,
        userId: "user-1",
        input: { themeId: "example.theme-package-night" },
      }),
    ).resolves.toMatchObject({
      preferences: { themeId: "example.theme-package-night" },
    });
    await expect(
      new UpdateUserPreferences(repository, themes).execute({
        type: "user.update-preferences",
        actorId: "user-1",
        isAdmin: false,
        userId: "user-1",
        input: { themeId: "missing-theme" },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Invalid preferences payload",
    });
  });

  it("preserves admin deletion accounting and reset-link SMTP behavior", async () => {
    const repository = users();
    await expect(
      new DeleteUserAsAdmin(repository).execute({
        type: "user.admin-delete",
        actorId: "admin-1",
        userId: "user-1",
      }),
    ).resolves.toBe(3);
    expect(repository.deleteUser).toHaveBeenCalledWith("user-1");
    const email = await new SendUserPasswordResetLink(
      repository,
      notifier,
    ).execute({ type: "user.send-password-reset-link", userId: "user-1" });
    expect(email).toBe("mira@example.com");
    expect(notifier.send).toHaveBeenCalledWith(
      "mira@example.com",
      expect.any(String),
      "Mira",
    );
  });
});
