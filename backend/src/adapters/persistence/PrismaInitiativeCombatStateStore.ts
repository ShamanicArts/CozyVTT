import { Prisma, PrismaClient } from "@prisma/client";
import {
  InitiativeCombatStateStore,
  VersionedInitiativeState,
} from "../../ports/InitiativeCombatStateStore";
import {
  emptyInitiativeState,
  InitiativeState,
} from "../../domain/initiative/Initiative";

export class InitiativeStateConflictError extends Error {
  constructor() {
    super("Initiative state changed; refresh and retry");
    this.name = "InitiativeStateConflictError";
  }
}

/** Campaign-row persistence keeps combat state durable and campaign-scoped. */
export class PrismaInitiativeCombatStateStore
  implements InitiativeCombatStateStore
{
  constructor(private readonly client: PrismaClient) {}

  async get(campaignId: string): Promise<VersionedInitiativeState> {
    const campaign = await this.client.campaign.findUnique({
      where: { id: campaignId },
      select: { initiativeState: true, initiativeRevision: true },
    });
    if (!campaign) throw new Error("Campaign not found");
    return {
      state: parseState(campaign.initiativeState),
      revision: campaign.initiativeRevision,
    };
  }

  async set(
    campaignId: string,
    expectedRevision: number,
    state: InitiativeState,
  ): Promise<VersionedInitiativeState> {
    const result = await this.client.campaign.updateMany({
      where: { id: campaignId, initiativeRevision: expectedRevision },
      data: {
        initiativeState: state as unknown as Prisma.InputJsonValue,
        initiativeRevision: { increment: 1 },
      },
    });
    if (result.count !== 1) throw new InitiativeStateConflictError();
    return { state: cloneState(state), revision: expectedRevision + 1 };
  }

  clear(
    campaignId: string,
    expectedRevision: number,
  ): Promise<VersionedInitiativeState> {
    return this.set(campaignId, expectedRevision, emptyInitiativeState());
  }
}

function parseState(value: Prisma.JsonValue): InitiativeState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyInitiativeState();
  }
  const candidate = value as Record<string, Prisma.JsonValue>;
  if (!Array.isArray(candidate.combatants)) return emptyInitiativeState();
  return cloneState(candidate as unknown as InitiativeState);
}

function cloneState(state: InitiativeState): InitiativeState {
  return {
    active: state.active,
    round: state.round,
    currentTokenId: state.currentTokenId,
    combatants: state.combatants.map((combatant) => ({
      ...combatant,
      hp: combatant.hp ? { ...combatant.hp } : null,
    })),
  };
}
