import { prisma } from "../config/database";
import {
  productionPrisma,
  productionTransactionContext,
} from "./productionTransactionContext";
import { productionCampaignEventJournal } from "./productionCampaignEventJournal";
import { PrismaPluginAccessRepository } from "../adapters/persistence/PrismaPluginAccessRepository";
import { CommandBus } from "../application/commands/CommandBus";
import { TransactionalCommandHandler } from "../application/commands/TransactionalCommandHandler";
import { ApplicationHost, CommandMetadata } from "./ApplicationHost";

export {
  digestCanonical,
  HostCommandError,
  IdempotencyReplayError,
} from "./ApplicationHost";
import { durableExecutionMiddleware } from "./ApplicationHost";
import {
  PrismaCapabilityAuditPort,
  PrismaExtensionGrantPort,
  PrismaIdempotencyPort,
  PrismaOutboxPort,
} from "../adapters/persistence/PrismaDurableFoundations";
import { PrismaTokenTemplateRepository } from "../adapters/persistence/PrismaTokenTemplateRepository";
import { PrismaExtensionInstallationRepository } from "../extensions/host/adapters/PrismaExtensionInstallationRepository";
import { NoopDomainEventPublisher } from "../adapters/events/NoopDomainEventPublisher";
import {
  CREATE_TOKEN_TEMPLATE,
  CreateTokenTemplate,
} from "../application/tokenTemplates/CreateTokenTemplate";
import {
  COPY_TOKEN_TEMPLATE,
  DELETE_TOKEN_TEMPLATE,
  SAVE_TOKEN_TEMPLATE,
  UPDATE_TOKEN_TEMPLATE,
  CopyTokenTemplate,
  DeleteTokenTemplate,
  SaveTokenTemplate,
  UpdateTokenTemplate,
} from "../application/tokenTemplates/TokenTemplateMutations";
import { PrismaCampaignRealtimeRepository } from "../adapters/persistence/PrismaCampaignRealtimeRepository";
import {
  SET_ATMOSPHERE_AUDIO,
  SET_ATMOSPHERE_EFFECT,
  SET_CAMPAIGN_VIBE,
  SetAtmosphereAudio,
  SetAtmosphereEffect,
  SetCampaignVibe,
} from "../application/campaigns/RealtimeCampaignCommands";
import { PrismaRealtimeCharacterRepository } from "../adapters/persistence/PrismaRealtimeCharacterRepository";
import {
  UPDATE_CHARACTER_HP,
  UpdateCharacterHp,
} from "../application/characters/RealtimeCharacterCommands";
import { PrismaRealtimeSpiritRepository } from "../adapters/persistence/PrismaRealtimeSpiritRepository";
import {
  SET_SPIRIT_LAYER_ENABLED,
  SET_SPIRIT_TOKEN_VISIBLE,
  SetSpiritLayerEnabled,
  SetSpiritTokenVisible,
} from "../application/scene/RealtimeSpiritCommands";
import { PrismaMapCoreRepository } from "../adapters/persistence/PrismaMapCoreRepository";
import { HttpRemoteMapAssetIngress } from "../adapters/assets/HttpRemoteMapAssetIngress";
import {
  CHANGE_MAP,
  CREATE_MAP,
  DELETE_MAP,
  SET_CURRENT_MAP,
  UPDATE_MAP,
  CreateMap,
  ChangeMap,
  DeleteMap,
  SetCurrentMap,
  UpdateMap,
} from "../application/maps/MapLifecycleCommands";
import {
  IMPORT_REMOTE_MAP,
  ImportRemoteMap,
} from "../application/maps/RemoteMapImportCommands";
import { PrismaMapTokenRepository } from "../adapters/persistence/PrismaMapTokenRepository";
import {
  CREATE_MAP_TOKEN,
  DELETE_MAP_TOKEN,
  UPDATE_MAP_TOKEN,
  CreateMapToken,
  DeleteMapToken,
  UpdateMapToken,
} from "../application/mapTokens/MapTokenMutations";
import { PrismaSceneMutationRepository } from "../adapters/persistence/PrismaSceneMutationRepository";
import {
  ADD_LIGHT_SOURCE,
  ADD_WALL_SEGMENT,
  APPLY_FOG_OPERATION,
  REMOVE_LIGHT_SOURCE,
  REMOVE_WALL_SEGMENT,
  REPLACE_LIGHT_SOURCES,
  REPLACE_WALL_SEGMENTS,
  SET_SCENE_LIGHTING_ENABLED,
  UPDATE_LIGHT_SOURCE,
  UPDATE_WALL_SEGMENT,
  AddLightSource,
  AddWallSegment,
  ApplyFogOperation,
  RemoveLightSource,
  RemoveWallSegment,
  ReplaceLightSources,
  ReplaceWallSegments,
  SetSceneLightingEnabled,
  UpdateLightSource,
  UpdateWallSegment,
} from "../application/scene/SceneMutations";
import { PrismaTokenMovementRepository } from "../adapters/persistence/PrismaTokenMovementRepository";
import { productionRealtimeQueries } from "./productionRealtimeQueries";
import {
  FINALIZE_TOKEN_MOVE,
  PREVIEW_TOKEN_MOVE,
  START_TOKEN_MOVE,
  FinalizeTokenMove,
  PreviewTokenMove,
  StartTokenMove,
} from "../application/tokens/TokenMovement";
import { PrismaCampaignAdministrationRepository } from "../adapters/persistence/PrismaCampaignAdministrationRepository";
import {
  CHANGE_CAMPAIGN_MEMBER_ROLE,
  ACCEPT_CAMPAIGN_INVITATION,
  DECLINE_CAMPAIGN_INVITATION,
  CREATE_CAMPAIGN,
  DELETE_CAMPAIGN,
  INVITE_TO_CAMPAIGN,
  REMOVE_CAMPAIGN_MEMBER,
  UPDATE_CAMPAIGN,
  UPDATE_CAMPAIGN_VIBE,
  ChangeCampaignMemberRole,
  AcceptCampaignInvitation,
  DeclineCampaignInvitation,
  CreateCampaign,
  DeleteCampaign,
  InviteToCampaign,
  RemoveCampaignMember,
  UpdateCampaign,
  UpdateCampaignVibe,
} from "../application/campaigns/CampaignCommands";
import { PrismaCampaignSessionRepository } from "../adapters/persistence/PrismaCampaignSessionRepository";
import { PrismaCampaignSessionState } from "../adapters/persistence/PrismaCampaignSessionState";
import {
  END_CAMPAIGN_SESSION,
  PAUSE_CAMPAIGN_SESSION,
  RESUME_CAMPAIGN_SESSION,
  START_CAMPAIGN_SESSION,
  EndCampaignSession,
  PauseCampaignSession,
  ResumeCampaignSession,
  StartCampaignSession,
} from "../application/campaigns/SessionLifecycleCommands";
import * as Admin from "../application/admin/AdminMutations";
import * as Assets from "../application/assets/AssetMutations";
import * as Characters from "../application/characters/CharacterMutations";
import * as Chat from "../application/chat/SendChatMessage";
import * as SystemMessages from "../application/chat/SystemMessageCommands";
import * as Dice from "../application/dice/RollDice";
import * as Initiative from "../application/initiative/InitiativeCommands";
import * as Identity from "../application/identity/AuthenticationCommands";
import * as AuthSecurity from "../application/identity/AuthSecurityCommands";
import * as Archives from "../application/campaignArchives/CampaignArchiveCommands";
import * as Creatures from "../application/creatures/CreatureMutations";
import * as Users from "../application/users/UserMutations";
import {
  IMPORT_UVTT_MAP,
  ImportUvttMap,
} from "../application/maps/UvttMapImportCommands";
import { PrismaAdminAdministrationRepository } from "../adapters/persistence/PrismaAdminAdministrationRepository";
import { ServiceAdminMailer } from "../adapters/admin/ServiceAdminMailer";
import { ArgonAdminPasswordHasher } from "../adapters/admin/ArgonAdminPasswordHasher";
import { FileSystemAdminBackupStore } from "../adapters/admin/FileSystemAdminBackupStore";
import { PrismaAssetMutationRepository } from "../adapters/persistence/PrismaAssetMutationRepository";
import { FileSystemAssetFileStore } from "../adapters/assets/FileSystemAssetFileStore";
import { PrismaCharacterRepository } from "../adapters/persistence/PrismaCharacterRepository";
import { WebsocketCharacterEventPublisher } from "../adapters/events/WebsocketCharacterEventPublisher";
import { WebsocketCampaignRealtimeEventPublisher } from "../adapters/events/WebsocketCampaignRealtimeEventPublisher";
import { PrismaChatMessageRepository } from "../adapters/persistence/PrismaChatMessageRepository";
import { SocketCampaignChatCooldownGate } from "../adapters/rateLimiting/SocketCampaignChatCooldownGate";
import { chatMessageLimiter, diceRollLimiter } from "../websocket/shared";
import { PrismaSystemMessageRepository } from "../adapters/persistence/PrismaSystemMessageRepository";
import { PrismaDiceRollRepository } from "../adapters/persistence/PrismaDiceRollRepository";
import { DiceParserExpressionRoller } from "../adapters/dice/DiceParserExpressionRoller";
import { SocketCampaignDiceRollRateGate } from "../adapters/rateLimiting/SocketCampaignDiceRollRateGate";
import { PrismaInitiativeRepository } from "../adapters/persistence/PrismaInitiativeRepository";
import { PrismaInitiativeCombatStateStore } from "../adapters/persistence/PrismaInitiativeCombatStateStore";
import { PrismaAuthenticationService } from "../adapters/auth/PrismaAuthenticationService";
import { LoginSessionInvalidator } from "../adapters/auth/LoginSessionInvalidator";
import {
  INITIALIZE_SETUP,
  InitializeSetup,
} from "../application/identity/Setup";
import { productionSystemSettings } from "./productionPublicSettingsQueries";
import { PrismaRegistrationPolicy } from "../adapters/persistence/PrismaRegistrationPolicy";
import { PrismaAuthSecurityRepository } from "../adapters/persistence/PrismaAuthSecurityRepository";
import { SmtpPasswordResetNotifier } from "../adapters/email/SmtpPasswordResetNotifier";
import { CampaignArchiveEngineAdapter } from "../adapters/campaignArchives/CampaignArchiveEngineAdapter";
import { PrismaCreatureRepository } from "../adapters/persistence/PrismaCreatureRepository";
import { PrismaUserMutationRepository } from "../adapters/persistence/PrismaUserMutationRepository";
import { PrismaUvttMapImportRepository } from "../adapters/persistence/PrismaUvttMapImportRepository";
import { NodeUvttImportSource } from "../adapters/assets/NodeUvttImportSource";
import { PrismaCapabilityGameplayMembership } from "../adapters/persistence/PrismaCapabilityGameplayMembership";
import { WebsocketCapabilityGameplayEventPublisher } from "../adapters/events/WebsocketCapabilityGameplayEventPublisher";
import { WebsocketCampaignActivityRealtimePublisher } from "../adapters/events/WebsocketCampaignActivityRealtimePublisher";
import { CampaignInvitationEventPublisher } from "../adapters/events/CampaignInvitationEventPublisher";
import { WebsocketCampaignSessionNotifier } from "../adapters/events/WebsocketCampaignSessionNotifier";
import {
  PUBLIC_ADD_TO_COMBAT,
  PUBLIC_ADJUST_CHARACTER_HP,
  PUBLIC_CREATE_CHARACTER,
  PUBLIC_END_COMBAT,
  PUBLIC_MOVE_ACTOR,
  PUBLIC_NEXT_TURN,
  PUBLIC_REMOVE_FROM_COMBAT,
  PUBLIC_ROLL_AS_ACTOR,
  PUBLIC_SPAWN_ACTOR,
  PUBLIC_SPEAK_AS_ACTOR,
  PUBLIC_START_COMBAT,
  PUBLIC_UPDATE_ACTOR,
  AddCapabilityCombatant,
  AdjustCapabilityCharacterHp,
  CreateCapabilityCharacter,
  EndCapabilityCombat,
  MoveCapabilityActor,
  NextCapabilityTurn,
  RemoveCapabilityCombatant,
  RollAsCapabilityActor,
  SpawnCapabilityActor,
  SpeakAsCapabilityActor,
  StartCapabilityCombat,
  UpdateCapabilityActor,
} from "../application/capabilities/CapabilityGameplayCommands";
import {
  PUBLIC_ACTIVATE_MAP,
  PUBLIC_ADD_LIGHT,
  PUBLIC_ADD_WALL,
  PUBLIC_APPLY_FOG,
  PUBLIC_END_SESSION,
  PUBLIC_PAUSE_SESSION,
  PUBLIC_REMOVE_LIGHT,
  PUBLIC_REMOVE_WALL,
  PUBLIC_RESUME_SESSION,
  PUBLIC_SET_ATMOSPHERE_AUDIO,
  PUBLIC_SET_ATMOSPHERE_EFFECT,
  PUBLIC_SET_LIGHTING,
  PUBLIC_SET_VIBE,
  PUBLIC_START_SESSION,
  PUBLIC_UPDATE_LIGHT,
  PUBLIC_UPDATE_WALL,
  ActivateCapabilityMap,
  AddCapabilityLight,
  AddCapabilityWall,
  ApplyCapabilityFog,
  EndCapabilitySession,
  PauseCapabilitySession,
  RemoveCapabilityLight,
  RemoveCapabilityWall,
  ResumeCapabilitySession,
  SetCapabilityAtmosphereAudio,
  SetCapabilityAtmosphereEffect,
  SetCapabilityLighting,
  SetCapabilityVibe,
  StartCapabilitySession,
  UpdateCapabilityLight,
  UpdateCapabilityWall,
} from "../application/capabilities/CapabilityGmCommands";
import { findCoreCapabilityCommand } from "../application/capabilities/CoreCapabilityCatalog";
import {
  PUBLIC_PUBLISH_CAMPAIGN_ACTIVITY,
  PublishCampaignActivity,
} from "../application/capabilities/CampaignActivityCommands";

/** Single process-wide handler graph for commands shared by HTTP and Socket.IO. */
const productionCommandBus = new CommandBus();
const transactionContext = productionTransactionContext;
const transactionalPrisma = productionPrisma;
const maps = new PrismaMapCoreRepository(transactionalPrisma);
productionCommandBus.register(CREATE_MAP, new CreateMap(maps));
productionCommandBus.register(UPDATE_MAP, new UpdateMap(maps));
productionCommandBus.register(DELETE_MAP, new DeleteMap(maps));
productionCommandBus.register(SET_CURRENT_MAP, new SetCurrentMap(maps));
const tokens = new PrismaMapTokenRepository(transactionalPrisma);
productionCommandBus.register(CREATE_MAP_TOKEN, new CreateMapToken(tokens));
productionCommandBus.register(UPDATE_MAP_TOKEN, new UpdateMapToken(tokens));
productionCommandBus.register(DELETE_MAP_TOKEN, new DeleteMapToken(tokens));
const scene = new PrismaSceneMutationRepository(transactionalPrisma);
productionCommandBus.register(ADD_WALL_SEGMENT, new AddWallSegment(scene));
productionCommandBus.register(
  REMOVE_WALL_SEGMENT,
  new RemoveWallSegment(scene),
);
productionCommandBus.register(
  UPDATE_WALL_SEGMENT,
  new UpdateWallSegment(scene),
);
productionCommandBus.register(
  REPLACE_WALL_SEGMENTS,
  new ReplaceWallSegments(scene),
);
productionCommandBus.register(
  APPLY_FOG_OPERATION,
  new ApplyFogOperation(scene),
);
productionCommandBus.register(ADD_LIGHT_SOURCE, new AddLightSource(scene));
productionCommandBus.register(
  REMOVE_LIGHT_SOURCE,
  new RemoveLightSource(scene),
);
productionCommandBus.register(
  UPDATE_LIGHT_SOURCE,
  new UpdateLightSource(scene),
);
productionCommandBus.register(
  REPLACE_LIGHT_SOURCES,
  new ReplaceLightSources(scene),
);
productionCommandBus.register(
  SET_SCENE_LIGHTING_ENABLED,
  new SetSceneLightingEnabled(scene),
);
const movement = new PrismaTokenMovementRepository(transactionalPrisma);
const movementSpiritVisibility = productionRealtimeQueries;
productionCommandBus.register(
  START_TOKEN_MOVE,
  new StartTokenMove(movement, movementSpiritVisibility),
);
productionCommandBus.register(
  PREVIEW_TOKEN_MOVE,
  new PreviewTokenMove(movement),
);
productionCommandBus.register(
  FINALIZE_TOKEN_MOVE,
  new FinalizeTokenMove(movement, movementSpiritVisibility),
);
const campaigns = new PrismaCampaignAdministrationRepository(
  transactionalPrisma,
);
productionCommandBus.register(CREATE_CAMPAIGN, new CreateCampaign(campaigns));
productionCommandBus.register(UPDATE_CAMPAIGN, new UpdateCampaign(campaigns));
productionCommandBus.register(
  UPDATE_CAMPAIGN_VIBE,
  new UpdateCampaignVibe(campaigns),
);
productionCommandBus.register(DELETE_CAMPAIGN, new DeleteCampaign(campaigns));
productionCommandBus.register(
  INVITE_TO_CAMPAIGN,
  new InviteToCampaign(campaigns, new CampaignInvitationEventPublisher()),
);
productionCommandBus.register(
  REMOVE_CAMPAIGN_MEMBER,
  new RemoveCampaignMember(campaigns),
);
productionCommandBus.register(
  CHANGE_CAMPAIGN_MEMBER_ROLE,
  new ChangeCampaignMemberRole(campaigns),
);
productionCommandBus.register(
  ACCEPT_CAMPAIGN_INVITATION,
  new AcceptCampaignInvitation(campaigns),
);
productionCommandBus.register(
  DECLINE_CAMPAIGN_INVITATION,
  new DeclineCampaignInvitation(campaigns),
);
const sessions = new PrismaCampaignSessionRepository(transactionalPrisma);
const sessionState = new PrismaCampaignSessionState(transactionalPrisma);
const sessionNotifier = new WebsocketCampaignSessionNotifier();
productionCommandBus.register(
  START_CAMPAIGN_SESSION,
  new StartCampaignSession(sessions, sessionState, sessionNotifier),
);
productionCommandBus.register(
  PAUSE_CAMPAIGN_SESSION,
  new PauseCampaignSession(sessions, sessionState, sessionNotifier),
);
productionCommandBus.register(
  END_CAMPAIGN_SESSION,
  new EndCampaignSession(sessions, sessionState, sessionNotifier),
);
productionCommandBus.register(
  RESUME_CAMPAIGN_SESSION,
  new ResumeCampaignSession(sessions, sessionState, sessionNotifier),
);
const realtime = new PrismaCampaignRealtimeRepository(transactionalPrisma);
const realtimeEvents = new WebsocketCampaignRealtimeEventPublisher();
productionCommandBus.register(
  SET_ATMOSPHERE_EFFECT,
  new SetAtmosphereEffect(realtime, realtimeEvents),
);
productionCommandBus.register(
  SET_ATMOSPHERE_AUDIO,
  new SetAtmosphereAudio(realtime, realtimeEvents),
);
productionCommandBus.register(
  SET_CAMPAIGN_VIBE,
  new SetCampaignVibe(realtime, realtimeEvents),
);
const realtimeCharacters = new PrismaRealtimeCharacterRepository(
  transactionalPrisma,
);
productionCommandBus.register(
  UPDATE_CHARACTER_HP,
  new UpdateCharacterHp(realtimeCharacters),
);
const realtimeSpirit = new PrismaRealtimeSpiritRepository(transactionalPrisma);
productionCommandBus.register(
  SET_SPIRIT_LAYER_ENABLED,
  new SetSpiritLayerEnabled(realtimeSpirit),
);
productionCommandBus.register(
  SET_SPIRIT_TOKEN_VISIBLE,
  new SetSpiritTokenVisible(realtimeSpirit),
);
const templates = new PrismaTokenTemplateRepository(transactionalPrisma);
productionCommandBus.register(
  CREATE_TOKEN_TEMPLATE,
  new CreateTokenTemplate(templates, new NoopDomainEventPublisher()),
);
productionCommandBus.register(
  UPDATE_TOKEN_TEMPLATE,
  new UpdateTokenTemplate(templates),
);
productionCommandBus.register(
  DELETE_TOKEN_TEMPLATE,
  new DeleteTokenTemplate(templates),
);
productionCommandBus.register(
  SAVE_TOKEN_TEMPLATE,
  new SaveTokenTemplate(templates),
);
productionCommandBus.register(
  COPY_TOKEN_TEMPLATE,
  new CopyTokenTemplate(templates),
);
productionCommandBus.register(CHANGE_MAP, new ChangeMap(maps));
const archiveService = new CampaignArchiveEngineAdapter(transactionalPrisma);
productionCommandBus.register(
  Archives.EXPORT_CAMPAIGN_ARCHIVE,
  new Archives.ExportCampaignArchive(archiveService),
);
productionCommandBus.register(
  Archives.PREVIEW_CAMPAIGN_ARCHIVE_IMPORT,
  new Archives.PreviewCampaignArchiveImport(archiveService),
);
productionCommandBus.register(
  Archives.IMPORT_CAMPAIGN_ARCHIVE,
  new Archives.ImportCampaignArchive(archiveService),
);
productionCommandBus.register(
  IMPORT_UVTT_MAP,
  new ImportUvttMap(
    new PrismaUvttMapImportRepository(transactionalPrisma),
    new NodeUvttImportSource(),
  ),
);
const userMutations = new PrismaUserMutationRepository(transactionalPrisma);
const extensionInstallations = new PrismaExtensionInstallationRepository(
  transactionalPrisma,
);
productionCommandBus.register(
  Users.UPDATE_USER_PROFILE,
  new Users.UpdateUserProfile(userMutations),
);
productionCommandBus.register(
  Users.UPDATE_USER_PREFERENCES,
  new Users.UpdateUserPreferences(userMutations, {
    hasActiveTheme: async (themeId) =>
      (await extensionInstallations.list()).some(
        (installation) =>
          installation.state === "active" &&
          installation.packageManifest.contributions.themes.some(
            (theme) => `${installation.extensionId}-${theme.id}` === themeId,
          ),
      ),
  }),
);
productionCommandBus.register(
  Users.DELETE_USER_AS_ADMIN,
  new Users.DeleteUserAsAdmin(userMutations, new LoginSessionInvalidator()),
);
productionCommandBus.register(
  Users.RESET_USER_PASSWORD_AS_ADMIN,
  new Users.ResetUserPasswordAsAdmin(
    userMutations,
    new ArgonAdminPasswordHasher(),
  ),
);
productionCommandBus.register(
  Users.SEND_USER_PASSWORD_RESET_LINK,
  new Users.SendUserPasswordResetLink(
    userMutations,
    new SmtpPasswordResetNotifier(),
  ),
);
const creatureRepository = new PrismaCreatureRepository(transactionalPrisma);
productionCommandBus.register(
  Creatures.CREATE_CREATURE,
  new Creatures.CreateCreature(creatureRepository),
);
productionCommandBus.register(
  Creatures.UPDATE_CREATURE,
  new Creatures.UpdateCreature(creatureRepository),
);
productionCommandBus.register(
  Creatures.DELETE_CREATURE,
  new Creatures.DeleteCreature(creatureRepository),
);
productionCommandBus.register(
  Creatures.DUPLICATE_CREATURE,
  new Creatures.DuplicateCreature(creatureRepository),
);
productionCommandBus.register(
  Creatures.TOGGLE_CREATURE_FAVORITE,
  new Creatures.ToggleCreatureFavorite(creatureRepository),
);
productionCommandBus.register(
  Creatures.SEED_SRD_CREATURES,
  new Creatures.SeedSrdCreatures(creatureRepository),
);
const chatRepository = new PrismaChatMessageRepository(transactionalPrisma);
const systemMessageRepository = new PrismaSystemMessageRepository(
  transactionalPrisma,
);
productionCommandBus.register(
  Chat.SEND_CHAT_MESSAGE,
  new Chat.SendChatMessage(
    chatRepository,
    new SocketCampaignChatCooldownGate(chatMessageLimiter),
  ),
);
productionCommandBus.register(
  SystemMessages.CREATE_SYSTEM_MESSAGE,
  new SystemMessages.CreateSystemMessage(systemMessageRepository),
);
productionCommandBus.register(
  PUBLIC_PUBLISH_CAMPAIGN_ACTIVITY,
  new PublishCampaignActivity(
    systemMessageRepository,
    new WebsocketCampaignActivityRealtimePublisher(),
  ),
);
productionCommandBus.register(
  Dice.ROLL_DICE,
  new Dice.RollDice(
    new PrismaDiceRollRepository(transactionalPrisma),
    new DiceParserExpressionRoller(),
    new SocketCampaignDiceRollRateGate(diceRollLimiter),
  ),
);
const initiativeRepository = new PrismaInitiativeRepository(
  transactionalPrisma,
);
export const productionInitiativeStateStore =
  new PrismaInitiativeCombatStateStore(transactionalPrisma);
const initiativeState = productionInitiativeStateStore;
productionCommandBus.register(
  Initiative.ADD_INITIATIVE_COMBATANT,
  new TransactionalCommandHandler(
    transactionContext,
    new Initiative.AddInitiativeCombatant(
      initiativeRepository,
      initiativeState,
      productionCampaignEventJournal,
    ),
  ),
);
productionCommandBus.register(
  Initiative.REMOVE_INITIATIVE_COMBATANT,
  new TransactionalCommandHandler(
    transactionContext,
    new Initiative.RemoveInitiativeCombatant(
      initiativeRepository,
      initiativeState,
      productionCampaignEventJournal,
    ),
  ),
);
productionCommandBus.register(
  Initiative.SET_INITIATIVE_VALUE,
  new TransactionalCommandHandler(
    transactionContext,
    new Initiative.SetInitiativeValue(
      initiativeRepository,
      initiativeState,
      productionCampaignEventJournal,
    ),
  ),
);
productionCommandBus.register(
  Initiative.ROLL_INITIATIVE,
  new TransactionalCommandHandler(
    transactionContext,
    new Initiative.RollInitiative(
      initiativeRepository,
      initiativeState,
      new DiceParserExpressionRoller(),
      productionCampaignEventJournal,
    ),
  ),
);
productionCommandBus.register(
  Initiative.REORDER_INITIATIVE,
  new TransactionalCommandHandler(
    transactionContext,
    new Initiative.ReorderInitiative(
      initiativeRepository,
      initiativeState,
      productionCampaignEventJournal,
    ),
  ),
);
productionCommandBus.register(
  Initiative.START_INITIATIVE_COMBAT,
  new TransactionalCommandHandler(
    transactionContext,
    new Initiative.StartInitiativeCombat(
      initiativeRepository,
      initiativeState,
      productionCampaignEventJournal,
    ),
  ),
);
productionCommandBus.register(
  Initiative.ADVANCE_INITIATIVE_TURN,
  new TransactionalCommandHandler(
    transactionContext,
    new Initiative.AdvanceInitiativeTurn(
      initiativeRepository,
      initiativeState,
      productionCampaignEventJournal,
    ),
  ),
);
productionCommandBus.register(
  Initiative.END_INITIATIVE_COMBAT,
  new TransactionalCommandHandler(
    transactionContext,
    new Initiative.EndInitiativeCombat(
      initiativeRepository,
      initiativeState,
      productionCampaignEventJournal,
    ),
  ),
);
const assetsRepository = new PrismaAssetMutationRepository(transactionalPrisma);
const assetFiles = new FileSystemAssetFileStore();
productionCommandBus.register(
  IMPORT_REMOTE_MAP,
  new ImportRemoteMap(assetsRepository, new HttpRemoteMapAssetIngress(), maps),
);
productionCommandBus.register(
  Assets.PREPARE_ASSET_UPLOAD,
  new Assets.PrepareAssetUpload(assetsRepository),
);
productionCommandBus.register(
  Assets.CREATE_ASSET,
  new Assets.CreateAsset(assetsRepository, assetFiles),
);
productionCommandBus.register(
  Assets.DISCARD_ASSET_UPLOAD,
  new Assets.DiscardAssetUpload(assetFiles),
);
productionCommandBus.register(
  Assets.DELETE_ASSET,
  new Assets.DeleteAsset(assetsRepository, assetFiles),
);
productionCommandBus.register(
  Assets.UPDATE_ASSET_SCOPE,
  new Assets.UpdateAssetScope(assetsRepository),
);
const characterRepository = new PrismaCharacterRepository(transactionalPrisma);
const characterEvents = new WebsocketCharacterEventPublisher();
productionCommandBus.register(
  Characters.CREATE_CHARACTER,
  new Characters.CreateCharacter(characterRepository, characterEvents),
);
productionCommandBus.register(
  Characters.UPDATE_CHARACTER,
  new Characters.UpdateCharacter(characterRepository, characterEvents),
);
productionCommandBus.register(
  Characters.DELETE_CHARACTER,
  new Characters.DeleteCharacter(characterRepository, characterEvents),
);
productionCommandBus.register(
  Characters.ASSIGN_CHARACTER,
  new Characters.AssignCharacter(characterRepository, characterEvents),
);
productionCommandBus.register(
  Characters.COPY_CHARACTER,
  new Characters.CopyCharacter(characterRepository, characterEvents),
);
const authentication = new PrismaAuthenticationService(
  transactionalPrisma,
  new ArgonAdminPasswordHasher(),
);
productionCommandBus.register(
  INITIALIZE_SETUP,
  new InitializeSetup(productionSystemSettings, authentication),
);
productionCommandBus.register(
  Identity.REGISTER_ACCOUNT,
  new Identity.RegisterAccount(
    authentication,
    new PrismaRegistrationPolicy(transactionalPrisma, productionSystemSettings),
  ),
);
productionCommandBus.register(
  Identity.LOGIN_ACCOUNT,
  new Identity.LoginAccount(authentication),
);
const authSecurity = new PrismaAuthSecurityRepository(transactionalPrisma);
const authPasswords = new ArgonAdminPasswordHasher();
productionCommandBus.register(
  AuthSecurity.FORGOT_PASSWORD,
  new AuthSecurity.ForgotPassword(
    authSecurity,
    new SmtpPasswordResetNotifier(),
  ),
);
productionCommandBus.register(
  AuthSecurity.RESET_PASSWORD,
  new AuthSecurity.ResetPassword(authSecurity, authPasswords),
);
productionCommandBus.register(
  AuthSecurity.CHANGE_PASSWORD,
  new AuthSecurity.ChangePassword(authSecurity, authPasswords),
);
productionCommandBus.register(
  AuthSecurity.DELETE_ACCOUNT,
  new AuthSecurity.DeleteAccount(authSecurity, authPasswords),
);
productionCommandBus.register(
  AuthSecurity.MFA_SETUP,
  new AuthSecurity.MfaSetup(authSecurity),
);
productionCommandBus.register(
  AuthSecurity.MFA_VERIFY,
  new AuthSecurity.MfaVerify(authSecurity),
);
productionCommandBus.register(
  AuthSecurity.MFA_VERIFY_LOGIN,
  new AuthSecurity.MfaVerifyLogin(authSecurity),
);
productionCommandBus.register(
  AuthSecurity.MFA_DISABLE,
  new AuthSecurity.MfaDisable(authSecurity, authPasswords),
);
productionCommandBus.register(
  AuthSecurity.MFA_BACKUP_CODES,
  new AuthSecurity.MfaBackupCodes(authSecurity, authPasswords),
);
const adminRepository = new PrismaAdminAdministrationRepository(
  transactionalPrisma,
  productionSystemSettings,
);
const adminMailer = new ServiceAdminMailer();
const adminBackups = new FileSystemAdminBackupStore(
  process.env.UPLOAD_DIR || "uploads",
  `${process.env.UPLOAD_DIR || "uploads"}/backups`,
  process.env.DATABASE_URL,
  100_000,
  10 * 1024 * 1024 * 1024,
);
productionCommandBus.register(
  Admin.UPDATE_ADMIN_SETTINGS,
  new Admin.UpdateAdminSettings(adminRepository, adminRepository),
);
productionCommandBus.register(
  Admin.CREATE_ADMIN_USER,
  new Admin.CreateAdminUser(
    adminRepository,
    adminRepository,
    new ArgonAdminPasswordHasher(),
    adminMailer,
  ),
);
productionCommandBus.register(
  Admin.INVITE_ADMIN_USER,
  new Admin.InviteAdminUser(
    adminRepository,
    adminRepository,
    new ArgonAdminPasswordHasher(),
    adminMailer,
  ),
);
productionCommandBus.register(
  Admin.RESEND_ADMIN_USER_INVITE,
  new Admin.ResendAdminUserInvite(
    adminRepository,
    adminRepository,
    new ArgonAdminPasswordHasher(),
    adminMailer,
  ),
);
productionCommandBus.register(
  Admin.APPROVE_ADMIN_USER,
  new Admin.ApproveAdminUser(adminRepository, adminRepository),
);
productionCommandBus.register(
  Admin.RESET_ADMIN_USER_MFA,
  new Admin.ResetAdminUserMfa(adminRepository, adminRepository),
);
productionCommandBus.register(
  Admin.SEND_ADMIN_SMTP_TEST,
  new Admin.SendAdminSmtpTest(adminRepository, adminRepository, adminMailer),
);
productionCommandBus.register(
  Admin.CREATE_ADMIN_BACKUP,
  new Admin.CreateAdminBackup(adminRepository, adminRepository, adminBackups),
);
productionCommandBus.register(
  Admin.DELETE_ADMIN_BACKUP,
  new Admin.DeleteAdminBackup(adminRepository, adminRepository, adminBackups),
);
productionCommandBus.register(
  Admin.RESTORE_ADMIN_BACKUP,
  new Admin.RestoreAdminBackup(adminRepository, adminRepository, adminBackups),
);

// Capability-facing orchestration is deliberately another application adapter over
// the same handlers humans use. It adds role-shaped convenience and live
// publication without duplicating token/chat/dice/initiative rules.
const capabilityMemberships = new PrismaCapabilityGameplayMembership(
  transactionalPrisma,
);
const capabilityEvents = new WebsocketCapabilityGameplayEventPublisher(
  undefined,
  (campaignId, userIds) =>
    productionRealtimeQueries.spiritVisibility(campaignId, userIds),
);
productionCommandBus.register(
  PUBLIC_SPAWN_ACTOR,
  new SpawnCapabilityActor(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_UPDATE_ACTOR,
  new UpdateCapabilityActor(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_MOVE_ACTOR,
  new MoveCapabilityActor(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_SPEAK_AS_ACTOR,
  new SpeakAsCapabilityActor(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_ROLL_AS_ACTOR,
  new RollAsCapabilityActor(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_ADJUST_CHARACTER_HP,
  new AdjustCapabilityCharacterHp(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_CREATE_CHARACTER,
  new CreateCapabilityCharacter(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_ADD_TO_COMBAT,
  new AddCapabilityCombatant(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_REMOVE_FROM_COMBAT,
  new RemoveCapabilityCombatant(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_START_COMBAT,
  new StartCapabilityCombat(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_NEXT_TURN,
  new NextCapabilityTurn(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_END_COMBAT,
  new EndCapabilityCombat(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_ACTIVATE_MAP,
  new ActivateCapabilityMap(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_ADD_WALL,
  new AddCapabilityWall(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_UPDATE_WALL,
  new UpdateCapabilityWall(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_REMOVE_WALL,
  new RemoveCapabilityWall(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_APPLY_FOG,
  new ApplyCapabilityFog(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_ADD_LIGHT,
  new AddCapabilityLight(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_UPDATE_LIGHT,
  new UpdateCapabilityLight(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_REMOVE_LIGHT,
  new RemoveCapabilityLight(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_SET_LIGHTING,
  new SetCapabilityLighting(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_SET_ATMOSPHERE_EFFECT,
  new SetCapabilityAtmosphereEffect(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_SET_ATMOSPHERE_AUDIO,
  new SetCapabilityAtmosphereAudio(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_SET_VIBE,
  new SetCapabilityVibe(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_START_SESSION,
  new StartCapabilitySession(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_PAUSE_SESSION,
  new PauseCapabilitySession(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_RESUME_SESSION,
  new ResumeCapabilitySession(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);
productionCommandBus.register(
  PUBLIC_END_SESSION,
  new EndCapabilitySession(
    productionCommandBus,
    capabilityMemberships,
    capabilityEvents,
  ),
);

/** Catalog facade delegates to the exact shared CommandBus handlers. */
export const productionApplicationHost = new ApplicationHost();
// Capability and extension-originated calls are default-deny: durable grants,
// idempotency state, and audit records are all enforced before a handler runs.
productionApplicationHost.use(
  durableExecutionMiddleware({
    grants: new PrismaExtensionGrantPort(prisma),
    audit: new PrismaCapabilityAuditPort(prisma),
    idempotency: new PrismaIdempotencyPort(transactionalPrisma),
    outbox: new PrismaOutboxPort(transactionalPrisma),
    delegatedCapabilityAccess: new PrismaPluginAccessRepository(prisma),
    unitOfWork: transactionContext,
  }),
);
/** The catalog derives from the shared registry so registrations cannot drift. */
export const productionCommandIds = productionCommandBus.registeredTypes();
const readOnlyCommandIds = new Set<string>([PREVIEW_TOKEN_MOVE]);
const highRiskCommandIds = new Set<string>([
  DELETE_MAP,
  DELETE_MAP_TOKEN,
  DELETE_CAMPAIGN,
  REMOVE_CAMPAIGN_MEMBER,
  CHANGE_CAMPAIGN_MEMBER_ROLE,
  END_CAMPAIGN_SESSION,
  SET_SPIRIT_LAYER_ENABLED,
  SET_SPIRIT_TOKEN_VISIBLE,
]);
const administratorCommandIds = new Set<string>([
  DELETE_CAMPAIGN,
  REMOVE_CAMPAIGN_MEMBER,
  CHANGE_CAMPAIGN_MEMBER_ROLE,
  START_CAMPAIGN_SESSION,
  PAUSE_CAMPAIGN_SESSION,
  END_CAMPAIGN_SESSION,
  RESUME_CAMPAIGN_SESSION,
]);

function metadataForProductionCommand(id: string): CommandMetadata {
  const coreCommand = findCoreCapabilityCommand(id);
  if (coreCommand) {
    const descriptor = coreCommand;
    return {
      id: descriptor.id,
      version: descriptor.version,
      title: descriptor.title,
      description: descriptor.description,
      risk: descriptor.risk.toUpperCase() as CommandMetadata["risk"],
      permissions: descriptor.write ? ["WRITE", "EXECUTE"] : ["READ"],
      approvalPolicy: descriptor.approvalRequired ? "ALWAYS" : "NEVER",
      outputRedactionPolicy: "campaign-role-v1",
      idempotency: descriptor.idempotencyRequired,
      outbox: descriptor.write
        ? {
            topic: "application.command.executed.v1",
            aggregateType: commandAggregateType(id),
            aggregateId: productionAggregateId,
          }
        : undefined,
      inputSchema: descriptor.inputSchema,
      outputSchema: descriptor.outputSchema,
    };
  }
  const readOnly = readOnlyCommandIds.has(id);
  const risk: CommandMetadata["risk"] = highRiskCommandIds.has(id)
    ? "HIGH"
    : readOnly
      ? "LOW"
      : "MEDIUM";
  const permissions: CommandMetadata["permissions"] = readOnly
    ? ["READ"]
    : administratorCommandIds.has(id)
      ? ["WRITE", "ADMIN"]
      : ["WRITE", "EXECUTE"];

  return {
    id,
    version: "1",
    title: id,
    description: `Execute the ${id} application capability.`,
    risk,
    permissions,
    approvalPolicy: risk === "HIGH" ? "RISK_BASED" : "NEVER",
    outputRedactionPolicy: "campaign-role-v1",
    idempotency: !readOnly,
    outbox: readOnly
      ? undefined
      : {
          topic: "application.command.executed.v1",
          aggregateType: commandAggregateType(id),
          aggregateId: productionAggregateId,
        },
    inputSchema: {
      type: "object",
      title: `${id} input`,
      description: `Validated ${id} command payload.`,
      additionalProperties: true,
    },
    outputSchema: {
      title: `${id} result`,
      description: `Result emitted by the ${id} command handler.`,
    },
  };
}

function commandAggregateType(id: string): string {
  if (id.startsWith("map.")) return "map";
  if (id.startsWith("token.")) return "token";
  if (id.startsWith("campaign.")) return "campaign";
  if (id.startsWith("scene.") || id.startsWith("spirit.")) return "scene";
  if (id.startsWith("template.")) return "token-template";
  return "command";
}

function productionAggregateId(
  input: unknown,
  output: unknown,
  context?: {
    campaignId?: string;
    correlationId?: string;
    idempotencyKey?: string;
  },
): string {
  const inputRecord =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : undefined;
  const outputRecord =
    output && typeof output === "object"
      ? (output as Record<string, unknown>)
      : undefined;
  for (const key of ["campaignId", "mapId", "tokenId", "templateId", "id"]) {
    const inputValue = inputRecord?.[key];
    if (typeof inputValue === "string" && inputValue.length > 0)
      return inputValue;
    const outputValue = outputRecord?.[key];
    if (typeof outputValue === "string" && outputValue.length > 0)
      return outputValue;
  }
  return (
    context?.campaignId ??
    context?.correlationId ??
    context?.idempotencyKey ??
    "unscoped"
  );
}

for (const id of productionCommandIds) {
  productionApplicationHost.register({
    metadata: metadataForProductionCommand(id),
    execute: (input, context) =>
      productionCommandBus.dispatch({
        ...(input as Record<string, unknown>),
        type: id,
        actorId: context?.delegatedIdentity ?? context?.principalId,
        sourceExtensionId:
          context?.sourceExtensionId ?? context?.extensionId,
      } as never),
  });
}
