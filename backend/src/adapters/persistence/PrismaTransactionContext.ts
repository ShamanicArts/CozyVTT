import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma, PrismaClient } from "@prisma/client";
import { UnitOfWorkPort } from "../../ports/UnitOfWork";

type PrismaExecutionClient = PrismaClient | Prisma.TransactionClient;

/**
 * A process-wide-looking Prisma client which resolves calls to the active
 * transaction when one is present. Repositories can keep their normal Prisma
 * constructor contract while capability-origin host dispatches are transactional.
 */
export class PrismaTransactionContext implements UnitOfWorkPort {
  private readonly storage = new AsyncLocalStorage<Prisma.TransactionClient>();
  readonly client: PrismaClient;

  constructor(private readonly root: PrismaClient) {
    this.client = new Proxy(root, {
      get: (_target, property, receiver) => {
        const transaction = this.storage.getStore();
        if (property === "$transaction" && transaction) {
          return <T>(
            nestedWork:
              | ((client: Prisma.TransactionClient) => Promise<T>)
              | readonly Prisma.PrismaPromise<unknown>[],
          ): Promise<T> => {
            if (typeof nestedWork !== "function") {
              return Promise.reject(
                new Error(
                  "Nested Prisma batch transactions are not supported inside an active transaction",
                ),
              );
            }
            return nestedWork(transaction);
          };
        }
        const activeClient = transaction ?? this.root;
        const value = Reflect.get(activeClient, property, receiver);
        return typeof value === "function" ? value.bind(activeClient) : value;
      },
    }) as PrismaClient;
  }

  execute<T>(work: () => Promise<T>): Promise<T> {
    if (this.storage.getStore()) return work();
    return this.root.$transaction((transaction) =>
      this.storage.run(transaction, work),
    );
  }

  activeClient(): PrismaExecutionClient {
    return this.storage.getStore() ?? this.root;
  }
}
