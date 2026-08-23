export type UserQueryRecord = Record<string, unknown> & {
  id: string;
  preferences?: unknown;
};

export interface UserQueryRepository {
  list(): Promise<UserQueryRecord[]>;
  find(userId: string): Promise<UserQueryRecord | null>;
}
