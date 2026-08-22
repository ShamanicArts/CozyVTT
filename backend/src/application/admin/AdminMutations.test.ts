import {
  APPROVE_ADMIN_USER,
  ApproveAdminUser,
  CREATE_ADMIN_BACKUP,
  CREATE_ADMIN_USER,
  CreateAdminBackup,
  CreateAdminUser,
  DELETE_ADMIN_BACKUP,
  DeleteAdminBackup,
  RESET_ADMIN_USER_MFA,
  ResetAdminUserMfa,
  RESTORE_ADMIN_BACKUP,
  RestoreAdminBackup,
  SEND_ADMIN_SMTP_TEST,
  SendAdminSmtpTest,
  UPDATE_ADMIN_SETTINGS,
  UpdateAdminSettings,
} from "./AdminMutations";
import { AdminCommandError, AdminUser } from "../../domain/admin/Admin";
import { AdminAdministrationRepository } from "../../ports/AdminAdministrationRepository";
import {
  AdminAuditLog,
  AdminBackupStore,
  AdminMailer,
  AdminPasswordHasher,
} from "../../ports/AdminPorts";

const actor = { userId: "admin-1" };
const user = (overrides: Partial<AdminUser> = {}): AdminUser => ({
  id: "user-1",
  email: "user@example.com",
  displayName: "User",
  platformRole: "USER",
  isApproved: false,
  mfaEnabled: true,
  ...overrides,
});
const repository = (): jest.Mocked<AdminAdministrationRepository> => ({
  updateSettings: jest.fn(async (data) => ({ ...data })),
  findUserByEmail: jest.fn(async (_email: string) => null),
  findUserById: jest.fn(async (_id: string) => user()),
  createUser: jest.fn(async (_data) => user()),
  deleteUser: jest.fn(async (_id: string) => undefined),
  invalidatePasswordResetTokens: jest.fn(async (_id: string) => undefined),
  createPasswordResetToken: jest.fn(
    async (_userId: string, _token: string, _expiresAt: Date) => undefined,
  ),
  approveUser: jest.fn(async (_id: string) => undefined),
  resetUserMfa: jest.fn(async (_id: string) => undefined),
});
const audit: jest.Mocked<AdminAuditLog> = {
  record: jest.fn(async (_actor, _message, _level, _context) => undefined),
};
const passwords: jest.Mocked<AdminPasswordHasher> = {
  hash: jest.fn(async (_value: string) => "hash"),
};
const mailer: jest.Mocked<AdminMailer> = {
  isConfigured: jest.fn(() => false),
  sendTestEmail: jest.fn(async (_email, _name) => undefined),
  sendWelcomeEmail: jest.fn(async (_email, _name, _password) => undefined),
  sendInvitationEmail: jest.fn(
    async (_email, _token, _name, _inviter, _days) => undefined,
  ),
};
const backups: jest.Mocked<AdminBackupStore> = {
  create: jest.fn(async () => ({
    filename: "backup-2026-08-20T10-00-00.zip",
    sizeBytes: 10,
    createdAt: "2026-08-20T10:00:00.000Z",
  })),
  delete: jest.fn(async (_filename: string) => true),
  restore: jest.fn(async (_path: string) => undefined),
};

beforeEach(() => jest.clearAllMocks());

describe("admin commands", () => {
  it("normalizes settings and keeps a value-free audit context", async () => {
    const store = repository();
    await new UpdateAdminSettings(store, audit).execute({
      type: UPDATE_ADMIN_SETTINGS,
      actor,
      input: { instanceName: " <b>Cozy</b> ", allowRegistration: true },
    });
    expect(store.updateSettings).toHaveBeenCalledWith({
      instanceName: "bCozy/b",
      allowRegistration: true,
    });
    expect(audit.record).toHaveBeenCalledWith(
      "admin-1",
      "Updated system settings: instanceName, allowRegistration",
      "INFO",
      { changes: { instanceName: "bCozy/b", allowRegistration: true } },
    );
  });

  it("validates user creation before hashing or persistence", async () => {
    const store = repository();
    await expect(
      new CreateAdminUser(store, audit, passwords, mailer).execute({
        type: CREATE_ADMIN_USER,
        actor,
        input: { email: "bad" },
      }),
    ).rejects.toEqual(
      new AdminCommandError(400, "Bad Request", "Invalid email address"),
    );
    expect(passwords.hash).not.toHaveBeenCalled();
    await expect(
      new CreateAdminUser(store, audit, passwords, mailer).execute({
        type: CREATE_ADMIN_USER,
        actor,
        input: { email: "user@example.com" },
      }),
    ).resolves.toMatchObject({ user: { id: "user-1" } });
  });

  it("preserves approval and MFA state guards", async () => {
    const store = repository();
    store.findUserById.mockResolvedValue(user({ isApproved: true }));
    await expect(
      new ApproveAdminUser(store, audit).execute({
        type: APPROVE_ADMIN_USER,
        actor,
        userId: "user-1",
      }),
    ).rejects.toEqual(
      new AdminCommandError(400, "Bad Request", "User is already approved"),
    );
    store.findUserById.mockResolvedValue(user({ mfaEnabled: false }));
    await expect(
      new ResetAdminUserMfa(store, audit).execute({
        type: RESET_ADMIN_USER_MFA,
        actor,
        userId: "user-1",
      }),
    ).rejects.toEqual(
      new AdminCommandError(
        400,
        "Bad Request",
        "MFA is not enabled for this user",
      ),
    );
  });

  it("checks SMTP configuration and maps sender errors without leaking orchestration", async () => {
    const store = repository();
    mailer.isConfigured.mockReturnValue(false);
    await expect(
      new SendAdminSmtpTest(store, audit, mailer).execute({
        type: SEND_ADMIN_SMTP_TEST,
        actor,
      }),
    ).rejects.toEqual(
      new AdminCommandError(
        400,
        "Bad Request",
        "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.",
      ),
    );
    mailer.isConfigured.mockReturnValue(true);
    mailer.sendTestEmail.mockRejectedValueOnce(new Error("connection refused"));
    await expect(
      new SendAdminSmtpTest(store, audit, mailer).execute({
        type: SEND_ADMIN_SMTP_TEST,
        actor,
      }),
    ).rejects.toEqual(
      new AdminCommandError(500, "SMTP Error", "connection refused"),
    );
  });

  it("uses the backup port for create/delete/restore while retaining filename safety", async () => {
    const store = repository();
    const create = new CreateAdminBackup(store, audit, backups);
    await expect(
      create.execute({ type: CREATE_ADMIN_BACKUP, actor }),
    ).resolves.toMatchObject({ filename: "backup-2026-08-20T10-00-00.zip" });
    const del = new DeleteAdminBackup(store, audit, backups);
    await expect(
      del.execute({
        type: DELETE_ADMIN_BACKUP,
        actor,
        filename: "../escape.zip",
      }),
    ).rejects.toEqual(
      new AdminCommandError(400, "Bad Request", "Invalid backup filename"),
    );
    await del.execute({
      type: DELETE_ADMIN_BACKUP,
      actor,
      filename: "backup-2026-08-20T10-00-00.zip",
    });
    await new RestoreAdminBackup(store, audit, backups).execute({
      type: RESTORE_ADMIN_BACKUP,
      actor,
      uploadedZip: "/tmp/restore.zip",
    });
    expect(backups.restore).toHaveBeenCalledWith("/tmp/restore.zip");
  });
});
