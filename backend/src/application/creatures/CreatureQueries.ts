import type {
  CreatureListQuery,
  CreatureQueryRepository,
} from "../../ports/CreatureQueryRepository";
import { CreatureError } from "./CreatureMutations";

export class CreatureQueries {
  constructor(private readonly creatures: CreatureQueryRepository) {}

  seedStatus() {
    return this.creatures.seedStatus();
  }

  async list(input: CreatureListQuery) {
    const result = await this.creatures.list(input);
    return { ...result, limit: input.limit, offset: input.offset };
  }

  async find(id: string) {
    const creature = await this.creatures.find(id);
    if (!creature)
      throw new CreatureError(404, "Not Found", "Creature template not found");
    return creature;
  }

  async favorites(campaignId: string, userId: string) {
    const favorites = await this.creatures.favorites(campaignId, userId);
    return {
      favoriteIds: favorites.map((favorite) => favorite.creatureId),
      creatures: favorites.map((favorite) => favorite.creature),
    };
  }
}
