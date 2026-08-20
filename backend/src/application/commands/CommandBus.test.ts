import { Command, CommandBus, CommandHandler, UnknownCommandError } from './CommandBus';

interface EchoCommand extends Command<string> {
  readonly type: 'echo';
  readonly message: string;
}

describe('CommandBus', () => {
  it('dispatches a typed command to its registered handler', async () => {
    const bus = new CommandBus();
    const handler: CommandHandler<EchoCommand, string> = { execute: async ({ message }) => message.toUpperCase() };
    bus.register('echo', handler);

    await expect(bus.dispatch<EchoCommand, string>({ type: 'echo', message: 'cozy' })).resolves.toBe('COZY');
  });

  it('rejects an unregistered command', async () => {
    const bus = new CommandBus();

    await expect(bus.dispatch<EchoCommand, string>({ type: 'echo', message: 'cozy' })).rejects.toBeInstanceOf(UnknownCommandError);
  });
});
