import type { CampaignActivityRealtimePublisher } from "../../ports/CampaignActivity";
import { getSocketInstance } from "../../websocket/socketInstance";

export class WebsocketCampaignActivityRealtimePublisher implements CampaignActivityRealtimePublisher {
  async publish(
    input: Parameters<CampaignActivityRealtimePublisher["publish"]>[0],
  ): Promise<void> {
    getSocketInstance().to(input.campaignId).emit("chat.system", {
      id: input.id,
      content: input.content,
      metadata: input.metadata,
      timestamp: input.createdAt.toISOString(),
    });
  }
}
