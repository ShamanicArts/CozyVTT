import type { PrismaClient } from "@prisma/client";
import type {
  SystemSettingsRepository,
  SystemSettingsView,
} from "../../ports/SystemSettingsRepository";

export class PrismaSystemSettingsRepository
  implements SystemSettingsRepository
{
  constructor(private readonly client: PrismaClient) {}

  userCount(): Promise<number> {
    return this.client.user.count();
  }

  async load(): Promise<SystemSettingsView> {
    const existing = await this.client.systemSettings.findFirst({
      orderBy: { id: "asc" },
    });
    const settings =
      existing ??
      (await this.client.systemSettings.create({
        data: {
          setupCompleted: false,
          instanceName: "CozyVTT",
          timezone: "UTC",
          allowRegistration: false,
          requireAdminApproval: true,
        },
      }));
    return settings as unknown as SystemSettingsView;
  }

  async completeSetup(): Promise<void> {
    await this.load();
    await this.client.systemSettings.updateMany({
      data: { setupCompleted: true },
    });
  }
  async update(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const settings = await this.load();
    return this.client.systemSettings.update({
      where: { id: settings.id },
      data: data as never,
    });
  }
}
