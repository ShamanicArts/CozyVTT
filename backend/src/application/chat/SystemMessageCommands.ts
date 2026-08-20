import { SystemMessageRepository } from "../../ports/SystemMessageRepository";
import { Command, CommandHandler } from "../commands/CommandBus";
export const CREATE_SYSTEM_MESSAGE = "chat.system.create" as const;
export interface CreateSystemMessageCommand extends Command<{
  id: string;
  createdAt: Date;
}> {
  readonly type: typeof CREATE_SYSTEM_MESSAGE;
  readonly campaignId: string;
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
}
export class CreateSystemMessage implements CommandHandler<
  CreateSystemMessageCommand,
  { id: string; createdAt: Date }
> {
  constructor(private readonly repository: SystemMessageRepository) {}
  execute(command: CreateSystemMessageCommand) {
    return this.repository.createSystemMessage(
      command.campaignId,
      command.content,
      command.metadata,
    );
  }
}
