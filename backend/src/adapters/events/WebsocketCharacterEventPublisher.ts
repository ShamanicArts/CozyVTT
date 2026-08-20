import { CharacterEventPublisher } from '../../ports/CharacterEventPublisher';
import { broadcastToCampaign } from '../../websocket/utils';

/** Socket.IO adapter retained behind the character application event port. */
export class WebsocketCharacterEventPublisher implements CharacterEventPublisher {
  publish(campaignId: string, event: string, payload: unknown): void {
    broadcastToCampaign(campaignId, event, payload);
  }
}
