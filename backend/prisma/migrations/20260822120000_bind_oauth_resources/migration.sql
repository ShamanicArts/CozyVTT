ALTER TABLE "AgentCredential" RENAME TO "DelegatedPluginCredential";
ALTER TABLE "McpOAuthClient" RENAME TO "OAuthClient";
ALTER TABLE "McpOAuthAuthorization" RENAME TO "OAuthAuthorization";
ALTER TABLE "McpOAuthRefreshToken" RENAME TO "OAuthRefreshToken";

ALTER TABLE "OAuthAuthorization"
  ADD COLUMN "pluginId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "resourceId" TEXT NOT NULL DEFAULT '';

ALTER TABLE "OAuthRefreshToken"
  ADD COLUMN "pluginId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "resourceId" TEXT NOT NULL DEFAULT '';

ALTER TABLE "OAuthAuthorization" ALTER COLUMN "pluginId" DROP DEFAULT;
ALTER TABLE "OAuthAuthorization" ALTER COLUMN "resourceId" DROP DEFAULT;
ALTER TABLE "OAuthRefreshToken" ALTER COLUMN "pluginId" DROP DEFAULT;
ALTER TABLE "OAuthRefreshToken" ALTER COLUMN "resourceId" DROP DEFAULT;
