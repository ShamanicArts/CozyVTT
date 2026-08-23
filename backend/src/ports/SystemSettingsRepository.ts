export interface SystemSettingsView {
  id: string;
  setupCompleted: boolean;
  allowRegistration: boolean;
  requireAdminApproval: boolean;
  themeId: string;
  customThemeColors: unknown;
  fontId: string;
  customLogoUrl: string | null;
  customFaviconUrl: string | null;
  customMascotUrl: string | null;
}

export interface SystemSettingsRepository {
  userCount(): Promise<number>;
  load(): Promise<SystemSettingsView>;
  completeSetup(): Promise<void>;
  update(data: Record<string, unknown>): Promise<Record<string, unknown>>;
}
