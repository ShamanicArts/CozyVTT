import { ManagedUser } from "../domain/users/UserMutations";

export interface UserProfileUpdate {
  displayName?: string;
  email?: string;
  avatarUrl?: unknown;
  bio?: string | null;
  platformRole?: "ADMIN" | "USER";
  globalAssetManager?: boolean;
  passwordHash?: string;
  mustChangePassword?: boolean;
}

export interface UserMutationRepository {
  findUser(id: string): Promise<ManagedUser | null>;
  findUserByEmail(email: string): Promise<ManagedUser | null>;
  updateUser(id: string, input: UserProfileUpdate): Promise<unknown>;
  findPreferences(
    id: string,
  ): Promise<{ exists: boolean; preferences: unknown }>;
  updatePreferences(id: string, preferences: unknown): Promise<unknown>;
  countUserAssets(id: string): Promise<number>;
  deleteUser(id: string): Promise<void>;
  invalidateUnusedPasswordResetTokens(userId: string): Promise<void>;
  createPasswordResetToken(
    userId: string,
    token: string,
    expiresAt: Date,
  ): Promise<void>;
}
