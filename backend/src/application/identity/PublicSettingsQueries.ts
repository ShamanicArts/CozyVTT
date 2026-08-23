import type { SystemSettingsRepository } from "../../ports/SystemSettingsRepository";

export class PublicSettingsQueries {
  constructor(private readonly settings: SystemSettingsRepository) {}

  async registrationStatus() {
    if ((await this.settings.userCount()) === 0)
      return { allowRegistration: true };
    return {
      allowRegistration: (await this.settings.load()).allowRegistration,
    };
  }

  async appearance() {
    const settings = await this.settings.load();
    return {
      themeId: settings.themeId,
      customThemeColors: settings.customThemeColors,
      fontId: settings.fontId,
      customLogoUrl: settings.customLogoUrl,
      customFaviconUrl: settings.customFaviconUrl,
      customMascotUrl: settings.customMascotUrl,
    };
  }

  async setupCompleted() {
    return (await this.settings.load()).setupCompleted;
  }
}
