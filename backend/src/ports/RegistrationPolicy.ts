export interface RegistrationPolicy {
  userCount(): Promise<number>;
  settings(): Promise<{
    allowRegistration: boolean;
    requireAdminApproval: boolean;
  }>;
  setApproval(userId: string, approved: boolean): Promise<void>;
}
