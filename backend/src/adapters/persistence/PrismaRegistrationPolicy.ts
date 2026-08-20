import { PrismaClient } from "@prisma/client";
import { RegistrationPolicy } from "../../ports/RegistrationPolicy";
import { getSystemSettings } from "../../services/systemSettings";

export class PrismaRegistrationPolicy implements RegistrationPolicy {
  constructor(private readonly client: PrismaClient) {}
  userCount(): Promise<number> {
    return this.client.user.count();
  }
  async settings(): Promise<{
    allowRegistration: boolean;
    requireAdminApproval: boolean;
  }> {
    const settings = await getSystemSettings();
    return {
      allowRegistration: settings.allowRegistration,
      requireAdminApproval: settings.requireAdminApproval,
    };
  }
  async setApproval(userId: string, approved: boolean): Promise<void> {
    await this.client.user.update({
      where: { id: userId },
      data: { isApproved: approved },
    });
  }
}
