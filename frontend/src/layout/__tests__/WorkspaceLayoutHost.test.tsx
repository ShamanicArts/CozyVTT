import { describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_LAYOUT_CONTRACT_VERSION,
  WorkspaceLayoutHost,
  WorkspaceLayoutRegistrationError,
  type WorkspaceLayoutContribution,
} from "@/layout";

const EmptyContribution = () => null;

function contribution(
  overrides: Partial<WorkspaceLayoutContribution> = {},
): WorkspaceLayoutContribution {
  return {
    contractVersion: WORKSPACE_LAYOUT_CONTRACT_VERSION,
    id: "core.activity",
    ownerId: "cozyvtt.core",
    region: "campaign.inspector",
    title: "Activity",
    component: EmptyContribution,
    ...overrides,
  };
}

const wideDm = { breakpoint: "wide", role: "DM" } as const;

describe("WorkspaceLayoutHost", () => {
  it("orders known-region contributions deterministically and filters context", () => {
    const host = new WorkspaceLayoutHost();
    host.register(contribution({ id: "later", order: 20 }));
    host.register(
      contribution({
        id: "dm-first",
        order: 10,
        visibility: { roles: ["DM"], breakpoints: ["wide"] },
      }),
    );
    host.register(
      contribution({
        id: "compact-only",
        order: 0,
        visibility: { breakpoints: ["compact"] },
      }),
    );

    expect(
      host.list("campaign.inspector", wideDm).map(({ id }) => id),
    ).toEqual(["dm-first", "later"]);
  });

  it("lets an owner update placement and safely dispose only its registration", () => {
    const host = new WorkspaceLayoutHost();
    const listener = vi.fn();
    host.subscribe(listener);
    const registration = host.register(contribution());

    registration.update({ order: -1 });
    expect(host.list("campaign.inspector", wideDm)[0]).toMatchObject({
      order: -1,
    });
    expect(host.unregister("core.activity", "someone.else")).toBe(false);
    registration.dispose();
    expect(host.list("campaign.inspector", wideDm)).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("rejects duplicate, incompatible, and invalid-order contributions", () => {
    const host = new WorkspaceLayoutHost();
    host.register(contribution());

    expect(() => host.register(contribution())).toThrow(
      WorkspaceLayoutRegistrationError,
    );
    expect(() =>
      new WorkspaceLayoutHost().register(
        contribution({
          // Deliberately exercise the runtime boundary.
          contractVersion: "2" as "1",
        }),
      ),
    ).toThrow(/supports 1/);
    expect(() =>
      new WorkspaceLayoutHost().register(
        contribution({ order: Number.NaN }),
      ),
    ).toThrow(/non-finite order/);
  });
});
