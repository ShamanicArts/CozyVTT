import { Prisma, PrismaClient } from "@prisma/client";
import { AdminSettingsUpdate, AdminUser } from "../../domain/admin/Admin";
import { AdminAdministrationRepository } from "../../ports/AdminAdministrationRepository";
import { AdminAuditLog } from "../../ports/AdminPorts";
import { updateSystemSettings } from "../../services/systemSettings";

/** Prisma/settings-service adapter for administration commands. */
export class PrismaAdminAdministrationRepository
  implements AdminAdministrationRepository, AdminAuditLog
{
  constructor(private readonly client: PrismaClient) {}

  async updateSettings(
    data: AdminSettingsUpdate,
  ): Promise<Record<string, unknown>> {
    return (await updateSystemSettings(data)) as Record<string, unknown>;
  }

  async findUserByEmail(email: string): Promise<AdminUser | null> {
    const user = await this.client.user.findUnique({ where: { email } });
    return user as unknown as AdminUser | null;
  }

  async findUserById(id: string): Promise<AdminUser | null> {
    const user = await this.client.user.findUnique({ where: { id } });
    return user as unknown as AdminUser | null;
  }

  async createUser(data: {
    email: string;
    displayName: string;
    passwordHash: string;
    platformRole: "ADMIN" | "USER";
    mustChangePassword: boolean;
  }): Promise<AdminUser> {
    const user = await this.client.user.create({ data });
    return user as unknown as AdminUser;
  }

  async approveUser(id: string): Promise<void> {
    await this.client.user.update({
      where: { id },
      data: { isApproved: true },
    });
  }

  async resetUserMfa(id: string): Promise<void> {
    await this.client.user.update({
      where: { id },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] },
    });
  }

  async record(
    actorId: string,
    message: string,
    level: "INFO" | "WARNING" | "ERROR" | "CRITICAL" = "INFO",
    context?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.client.systemLog.create({
        data: {
          level,
          message,
          userId: actorId,
          context: (context as Prisma.InputJsonObject) ?? Prisma.JsonNull,
        },
      });
    } catch {
      // Audit persistence is deliberately best effort, matching the legacy route.
    }
  }
}
