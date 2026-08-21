import type { UnitOfWorkPort } from "../../ports/UnitOfWork";
import type { Command, CommandHandler } from "./CommandBus";

/**
 * Gives transport-originated compound commands the same atomic application
 * boundary as protected host calls, without exposing a database transaction to
 * the command itself.
 */
export class TransactionalCommandHandler<
  C extends Command<R>,
  R,
> implements CommandHandler<C, R> {
  constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly handler: CommandHandler<C, R>,
  ) {}

  execute(command: C): Promise<R> {
    return this.unitOfWork.execute(() => this.handler.execute(command));
  }
}
