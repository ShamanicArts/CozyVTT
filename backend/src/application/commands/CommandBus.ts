/**
 * Small in-process command dispatcher. It is intentionally transport-neutral:
 * HTTP, websocket, CLI, and capability adapters can all dispatch the same command.
 */
export interface Command<TResult = unknown> {
  readonly type: string;
  /** Type-only output marker; commands never need to populate this at runtime. */
  readonly __result?: TResult;
}

export interface CommandHandler<TCommand extends Command<TResult>, TResult> {
  execute(command: TCommand): Promise<TResult>;
}

export class UnknownCommandError extends Error {
  constructor(type: string) {
    super(`No command handler registered for "${type}"`);
    this.name = "UnknownCommandError";
  }
}

export class CommandBus {
  private readonly handlers = new Map<
    string,
    CommandHandler<Command, unknown>
  >();

  register<TCommand extends Command<TResult>, TResult>(
    type: TCommand["type"],
    handler: CommandHandler<TCommand, TResult>,
  ): () => void {
    if (this.handlers.has(type)) {
      throw new Error(`A command handler is already registered for "${type}"`);
    }

    this.handlers.set(type, handler as CommandHandler<Command, unknown>);
    return () => {
      if (this.handlers.get(type) === handler) this.handlers.delete(type);
    };
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  registeredTypes(): string[] {
    return [...this.handlers.keys()];
  }

  async dispatch<TCommand extends Command<TResult>, TResult>(
    command: TCommand,
  ): Promise<TResult> {
    const handler = this.handlers.get(command.type);
    if (!handler) {
      throw new UnknownCommandError(command.type);
    }

    return handler.execute(command) as Promise<TResult>;
  }
}
