-- Preserve existing system IDs while allowing reviewed extensions to add new ones.
ALTER TABLE "Campaign"
  ALTER COLUMN "gameSystem" TYPE VARCHAR(128) USING "gameSystem"::text;

ALTER TABLE "Character"
  ALTER COLUMN "gameSystem" TYPE VARCHAR(128) USING "gameSystem"::text;

ALTER TABLE "CreatureTemplate"
  ALTER COLUMN "gameSystem" TYPE VARCHAR(128) USING "gameSystem"::text;

DROP TYPE "GameSystem";
