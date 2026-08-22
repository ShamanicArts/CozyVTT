import type { RollDiceResult } from "../application/dice/RollDice";
import type { InitiativeRollBroadcast } from "../application/initiative/InitiativeCommands";
import type { InitiativeState } from "../domain/initiative/Initiative";
import type { SendChatMessageResult } from "../application/chat/SendChatMessage";
import type { FinalizeTokenMoveResult } from "../application/tokens/TokenMovement";

export type CapabilityGameplayRole = "DM" | "PLAYER" | "SPECTATOR";

/** Identity and campaign membership required by capability-facing gameplay use cases. */
export interface CapabilityGameplayMembership {
  role(userId: string, campaignId: string): Promise<CapabilityGameplayRole | null>;
}

/**
 * Live-session output port. Gameplay commands do not know about Socket.IO;
 * another adapter can replace this publisher without changing their rules.
 */
export interface CapabilityGameplayEventPublisher {
  syncMap(campaignId: string, map: unknown): Promise<void>;
  actorMoved(
    campaignId: string,
    movedBy: string,
    result: FinalizeTokenMoveResult,
  ): Promise<void>;
  rosterUpdated(campaignId: string, payload: unknown): Promise<void>;
  characterHpUpdated(
    campaignId: string,
    characterId: string,
    hp: { current: number; max: number; temp: number },
  ): Promise<void>;
  chatMessage(
    campaignId: string,
    message: SendChatMessageResult,
  ): Promise<void>;
  diceRolled(campaignId: string, roll: RollDiceResult): Promise<void>;
  initiativeChanged(
    campaignId: string,
    state: InitiativeState,
    roll?: InitiativeRollBroadcast,
  ): Promise<void>;
}
