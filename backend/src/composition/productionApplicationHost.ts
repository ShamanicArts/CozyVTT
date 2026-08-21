import { prisma } from "../config/database";
import {
  productionPrisma,
  productionTransactionContext,
} from "./productionTransactionContext";
import { productionCampaignEventJournal } from "./productionCampaignEventJournal";
import { PrismaAgentAccessRepository } from "../adapters/persistence/PrismaAgentAccessRepository";
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
  PrismaAgentAuditPort,
  PrismaExtensionGrantPort,
  PrismaIdempotencyPort,
  PrismaOutboxPort,
} from "../adapters/persistence/PrismaDurableFoundations";
import { PrismaTokenTemplateRepository } from "../adapters/persistence/PrismaTokenTemplateRepository";
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
import { AssetUrlMapNormalizer } from "../adapters/assets/AssetUrlMapNormalizer";
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
import { LegacyMapTokenAssetUrlNormalizer } from "../adapters/assets/LegacyMapTokenAssetUrlNormalizer";
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
import { PrismaSpiritVisibilityPolicy } from "../adapters/authorization/PrismaSpiritVisibilityPolicy";
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
import { LegacyCampaignSessionState } from "../adapters/sessionState/LegacyCampaignSessionState";
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
import { LegacyCharacterAssetUrlNormalizer } from "../adapters/assets/LegacyCharacterAssetUrlNormalizer";
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
import { LegacyAuthenticationService } from "../adapters/auth/LegacyAuthenticationService";
import { PrismaRegistrationPolicy } from "../adapters/persistence/PrismaRegistrationPolicy";
import { PrismaAuthSecurityRepository } from "../adapters/persistence/PrismaAuthSecurityRepository";
import { SmtpPasswordResetNotifier } from "../adapters/email/SmtpPasswordResetNotifier";
import { LegacyCampaignArchiveService } from "../adapters/campaignArchives/LegacyCampaignArchiveService";
import { PrismaCreatureRepository } from "../adapters/persistence/PrismaCreatureRepository";
import { PrismaUserMutationRepository } from "../adapters/persistence/PrismaUserMutationRepository";
import { PrismaUvttMapImportRepository } from "../adapters/persistence/PrismaUvttMapImportRepository";
import { PrismaAgentGameplayMembership } from "../adapters/persistence/PrismaAgentGameplayMembership";
import { WebsocketAgentGameplayEventPublisher } from "../adapters/events/WebsocketAgentGameplayEventPublisher";
import {
  AGENT_ADD_TO_COMBAT,
  AGENT_ADJUST_CHARACTER_HP,
  AGENT_CREATE_CHARACTER,
  AGENT_END_COMBAT,
  AGENT_MOVE_ACTOR,
  AGENT_NEXT_TURN,
  AGENT_REMOVE_FROM_COMBAT,
  AGENT_ROLL_AS_ACTOR,
  AGENT_SPAWN_ACTOR,
  AGENT_SPEAK_AS_ACTOR,
  AGENT_START_COMBAT,
  AGENT_UPDATE_ACTOR,
  AddAgentCombatant,
  AdjustAgentCharacterHp,
  CreateAgentCharacter,
  EndAgentCombat,
  MoveAgentActor,
  NextAgentTurn,
  RemoveAgentCombatant,
  RollAsAgentActor,
  SpawnAgentActor,
  SpeakAsAgentActor,
  StartAgentCombat,
  UpdateAgentActor,
} from "../application/agents/AgentGameplayCommands";
import {
  AGENT_ACTIVATE_MAP,
  AGENT_ADD_LIGHT,
  AGENT_ADD_WALL,
  AGENT_APPLY_FOG,
  AGENT_END_SESSION,
  AGENT_PAUSE_SESSION,
  AGENT_REMOVE_LIGHT,
  AGENT_REMOVE_WALL,
  AGENT_RESUME_SESSION,
  AGENT_SET_ATMOSPHERE_AUDIO,
  AGENT_SET_ATMOSPHERE_EFFECT,
  AGENT_SET_LIGHTING,
  AGENT_SET_VIBE,
  AGENT_START_SESSION,
  AGENT_UPDATE_LIGHT,
  AGENT_UPDATE_WALL,
  ActivateAgentMap,
  AddAgentLight,
  AddAgentWall,
  ApplyAgentFog,
  EndAgentSession,
  PauseAgentSession,
  RemoveAgentLight,
  RemoveAgentWall,
  ResumeAgentSession,
  SetAgentAtmosphereAudio,
  SetAgentAtmosphereEffect,
  SetAgentLighting,
  SetAgentVibe,
  StartAgentSession,
  UpdateAgentLight,
  UpdateAgentWall,
} from "../application/agents/AgentGmCommands";

/** Single process-wide handler graph for commands shared by HTTP and Socket.IO. */
export const productionCommandBus = new CommandBus();
const transactionContext = productionTransactionContext;
const transactionalPrisma = productionPrisma;
const maps = new PrismaMapCoreRepository(transactionalPrisma);
const assets = new AssetUrlMapNormalizer();
productionCommandBus.register(CREATE_MAP, new CreateMap(maps, assets));
productionCommandBus.register(UPDATE_MAP, new UpdateMap(maps, assets));
productionCommandBus.register(DELETE_MAP, new DeleteMap(maps));
productionCommandBus.register(SET_CURRENT_MAP, new SetCurrentMap(maps));
const tokens = new PrismaMapTokenRepository(transactionalPrisma);
const tokenAssets = new LegacyMapTokenAssetUrlNormalizer();
productionCommandBus.register(
  CREATE_MAP_TOKEN,
  new CreateMapToken(tokens, tokenAssets),
);
productionCommandBus.register(
  UPDATE_MAP_TOKEN,
  new UpdateMapToken(tokens, tokenAssets),
);
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
const movementSpiritVisibility = new PrismaSpiritVisibilityPolicy();
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
  new InviteToCampaign(campaigns),
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
const sessionState = new LegacyCampaignSessionState();
productionCommandBus.register(
  START_CAMPAIGN_SESSION,
  new StartCampaignSession(sessions, sessionState),
);
productionCommandBus.register(
  PAUSE_CAMPAIGN_SESSION,
  new PauseCampaignSession(sessions, sessionState),
);
productionCommandBus.register(
  END_CAMPAIGN_SESSION,
  new EndCampaignSession(sessions, sessionState),
);
productionCommandBus.register(
  RESUME_CAMPAIGN_SESSION,
  new ResumeCampaignSession(sessions, sessionState),
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
const archiveService = new LegacyCampaignArchiveService();
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
  new ImportUvttMap(new PrismaUvttMapImportRepository(transactionalPrisma)),
);
const userMutations = new PrismaUserMutationRepository(transactionalPrisma);
productionCommandBus.register(
  Users.UPDATE_USER_PROFILE,
  new Users.UpdateUserProfile(userMutations),
);
productionCommandBus.register(
  Users.UPDATE_USER_PREFERENCES,
  new Users.UpdateUserPreferences(userMutations),
);
productionCommandBus.register(
  Users.DELETE_USER_AS_ADMIN,
  new Users.DeleteUserAsAdmin(userMutations),
);
productionCommandBus.register(
  Users.RESET_USER_PASSWORD_AS_ADMIN,
  new Users.ResetUserPasswordAsAdmin(userMutations),
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
productionCommandBus.register(
  Chat.SEND_CHAT_MESSAGE,
  new Chat.SendChatMessage(
    chatRepository,
    new SocketCampaignChatCooldownGate(chatMessageLimiter),
  ),
);
productionCommandBus.register(
  SystemMessages.CREATE_SYSTEM_MESSAGE,
  new SystemMessages.CreateSystemMessage(
    new PrismaSystemMessageRepository(transactionalPrisma),
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
  new ImportRemoteMap(
    assetsRepository,
    new HttpRemoteMapAssetIngress(),
    maps,
    assets,
  ),
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
  Assets.DELETE_ASSET,
  new Assets.DeleteAsset(assetsRepository, assetFiles),
);
productionCommandBus.register(
  Assets.UPDATE_ASSET_SCOPE,
  new Assets.UpdateAssetScope(assetsRepository),
);
const characterRepository = new PrismaCharacterRepository(transactionalPrisma);
const characterAssets = new LegacyCharacterAssetUrlNormalizer();
const characterEvents = new WebsocketCharacterEventPublisher();
productionCommandBus.register(
  Characters.CREATE_CHARACTER,
  new Characters.CreateCharacter(
    characterRepository,
    characterAssets,
    characterEvents,
  ),
);
productionCommandBus.register(
  Characters.UPDATE_CHARACTER,
  new Characters.UpdateCharacter(
    characterRepository,
    characterAssets,
    characterEvents,
  ),
);
productionCommandBus.register(
  Characters.DELETE_CHARACTER,
  new Characters.DeleteCharacter(
    characterRepository,
    characterAssets,
    characterEvents,
  ),
);
productionCommandBus.register(
  Characters.ASSIGN_CHARACTER,
  new Characters.AssignCharacter(
    characterRepository,
    characterAssets,
    characterEvents,
  ),
);
productionCommandBus.register(
  Characters.COPY_CHARACTER,
  new Characters.CopyCharacter(
    characterRepository,
    characterAssets,
    characterEvents,
  ),
);
const authentication = new LegacyAuthenticationService();
productionCommandBus.register(
  Identity.REGISTER_ACCOUNT,
  new Identity.RegisterAccount(
    authentication,
    new PrismaRegistrationPolicy(transactionalPrisma),
  ),
);
productionCommandBus.register(
  Identity.LOGIN_ACCOUNT,
  new Identity.LoginAccount(authentication),
);
const authSecurity = new PrismaAuthSecurityRepository(transactionalPrisma);
productionCommandBus.register(
  AuthSecurity.FORGOT_PASSWORD,
  new AuthSecurity.ForgotPassword(
    authSecurity,
    new SmtpPasswordResetNotifier(),
  ),
);
productionCommandBus.register(
  AuthSecurity.RESET_PASSWORD,
  new AuthSecurity.ResetPassword(authSecurity),
);
productionCommandBus.register(
  AuthSecurity.CHANGE_PASSWORD,
  new AuthSecurity.ChangePassword(authSecurity),
);
productionCommandBus.register(
  AuthSecurity.DELETE_ACCOUNT,
  new AuthSecurity.DeleteAccount(authSecurity),
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
  new AuthSecurity.MfaDisable(authSecurity),
);
productionCommandBus.register(
  AuthSecurity.MFA_BACKUP_CODES,
  new AuthSecurity.MfaBackupCodes(authSecurity),
);
const adminRepository = new PrismaAdminAdministrationRepository(
  transactionalPrisma,
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

// Agent-facing orchestration is deliberately another application adapter over
// the same handlers humans use. It adds role-shaped convenience and live
// publication without duplicating token/chat/dice/initiative rules.
const agentMemberships = new PrismaAgentGameplayMembership(transactionalPrisma);
const agentEvents = new WebsocketAgentGameplayEventPublisher();
productionCommandBus.register(
  AGENT_SPAWN_ACTOR,
  new SpawnAgentActor(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_UPDATE_ACTOR,
  new UpdateAgentActor(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_MOVE_ACTOR,
  new MoveAgentActor(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_SPEAK_AS_ACTOR,
  new SpeakAsAgentActor(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_ROLL_AS_ACTOR,
  new RollAsAgentActor(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_ADJUST_CHARACTER_HP,
  new AdjustAgentCharacterHp(
    productionCommandBus,
    agentMemberships,
    agentEvents,
  ),
);
productionCommandBus.register(
  AGENT_CREATE_CHARACTER,
  new CreateAgentCharacter(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_ADD_TO_COMBAT,
  new AddAgentCombatant(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_REMOVE_FROM_COMBAT,
  new RemoveAgentCombatant(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_START_COMBAT,
  new StartAgentCombat(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_NEXT_TURN,
  new NextAgentTurn(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_END_COMBAT,
  new EndAgentCombat(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_ACTIVATE_MAP,
  new ActivateAgentMap(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_ADD_WALL,
  new AddAgentWall(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_UPDATE_WALL,
  new UpdateAgentWall(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_REMOVE_WALL,
  new RemoveAgentWall(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_APPLY_FOG,
  new ApplyAgentFog(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_ADD_LIGHT,
  new AddAgentLight(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_UPDATE_LIGHT,
  new UpdateAgentLight(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_REMOVE_LIGHT,
  new RemoveAgentLight(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_SET_LIGHTING,
  new SetAgentLighting(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_SET_ATMOSPHERE_EFFECT,
  new SetAgentAtmosphereEffect(
    productionCommandBus,
    agentMemberships,
    agentEvents,
  ),
);
productionCommandBus.register(
  AGENT_SET_ATMOSPHERE_AUDIO,
  new SetAgentAtmosphereAudio(
    productionCommandBus,
    agentMemberships,
    agentEvents,
  ),
);
productionCommandBus.register(
  AGENT_SET_VIBE,
  new SetAgentVibe(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_START_SESSION,
  new StartAgentSession(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_PAUSE_SESSION,
  new PauseAgentSession(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_RESUME_SESSION,
  new ResumeAgentSession(productionCommandBus, agentMemberships, agentEvents),
);
productionCommandBus.register(
  AGENT_END_SESSION,
  new EndAgentSession(productionCommandBus, agentMemberships, agentEvents),
);

/** Catalog facade delegates to the exact shared CommandBus handlers. */
export const productionApplicationHost = new ApplicationHost();
// Agent and extension-originated calls are default-deny: durable grants,
// idempotency state, and audit records are all enforced before a handler runs.
productionApplicationHost.use(
  durableExecutionMiddleware({
    grants: new PrismaExtensionGrantPort(prisma),
    audit: new PrismaAgentAuditPort(prisma),
    idempotency: new PrismaIdempotencyPort(transactionalPrisma),
    outbox: new PrismaOutboxPort(transactionalPrisma),
    delegatedAgentAccess: new PrismaAgentAccessRepository(prisma),
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
    risk,
    permissions,
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
      } as never),
  });
}
