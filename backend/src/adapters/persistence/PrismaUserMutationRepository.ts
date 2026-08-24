import { Prisma, PrismaClient } from "@prisma/client";
import { ManagedUser } from "../../domain/users/UserMutations";
import {
  UserMutationRepository,
  UserProfileUpdate,
} from "../../ports/UserMutationRepository";

export class PrismaUserMutationRepository implements UserMutationRepository {
  constructor(private readonly client: PrismaClient) {}

  async findUser(id: string): Promise<ManagedUser | null> {
    return (await this.client.user.findUnique({
      where: { id },
    })) as ManagedUser | null;
  }

  async findUserByEmail(email: string): Promise<ManagedUser | null> {
    return (await this.client.user.findUnique({
      where: { email },
    })) as ManagedUser | null;
  }

  updateUser(id: string, input: UserProfileUpdate): Promise<object> {
    return this.client.user.update({ where: { id }, data: input as never });
  }

  async findPreferences(
    id: string,
  ): Promise<{ exists: boolean; preferences: unknown }> {
    const user = await this.client.user.findUnique({
      where: { id },
      select: { preferences: true },
    });
    return { exists: !!user, preferences: user?.preferences ?? null };
  }

  updatePreferences(id: string, preferences: unknown): Promise<unknown> {
    return this.client.user.update({
      where: { id },
      data: { preferences: preferences as Prisma.InputJsonValue },
      select: { id: true, preferences: true },
    });
  }

  countUserAssets(id: string): Promise<number> {
    return this.client.asset.count({
      where: { uploadedById: id, scope: "USER" },
    });
  }

  async deleteUser(id: string): Promise<void> {
    await this.client.user.delete({ where: { id } });
  }

  async invalidateUnusedPasswordResetTokens(userId: string): Promise<void> {
    await this.client.passwordResetToken.updateMany({
      where: { userId, used: false },
      data: { used: true },
    });
  }

  async createPasswordResetToken(
    userId: string,
    token: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.client.passwordResetToken.create({
      data: { userId, token, expiresAt },
    });
  }
}
