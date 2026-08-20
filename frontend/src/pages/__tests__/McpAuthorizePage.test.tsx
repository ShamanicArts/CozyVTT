import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({
  api: {
    getMcpAuthorizationRequest: vi.fn(),
    approveMcpAuthorization: vi.fn(),
    denyMcpAuthorization: vi.fn(),
  },
}));

vi.mock("@/services/api", () => ({ api }));

import McpAuthorizePage from "../McpAuthorizePage";

describe("McpAuthorizePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getMcpAuthorizationRequest.mockResolvedValue({
      requestId: "request-1",
      clientName: "Table helper",
      campaigns: [{ id: "campaign-1", name: "Lantern", role: "DM" }],
      expiresAt: "2026-08-21T12:00:00.000Z",
    });
  });

  it("offers one campaign approval without keys or administrator grants", async () => {
    render(
      <MemoryRouter initialEntries={["/mcp/authorize?request=request-1"]}>
        <McpAuthorizePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Table helper")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Lantern · dm" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Allow connection" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no API keys or administrator grants/i),
    ).toBeInTheDocument();
  });
});
