import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Message } from "@/types";
import ChatMessage from "../ChatMessage";

describe("ChatMessage capability actor identity", () => {
  it("uses the background-safe accent token for DM identity", () => {
    render(
      <ChatMessage
        message={
          {
            id: "message-dm",
            campaignId: "campaign-1",
            userId: "dm-1",
            type: "DM",
            content: "The passage is clear.",
            createdAt: new Date().toISOString(),
            user: { displayName: "CozyVTT Admin" },
          } as unknown as Message
        }
      />,
    );

    const sender = screen.getByText("CozyVTT Admin");
    expect(sender).toHaveClass("text-accent-ink");
    expect(sender).not.toHaveClass("text-accent-text");
  });

  it("shows the in-world actor while keeping control metadata out of chat", () => {
    render(
      <ChatMessage
        isCurrentUser
        message={
          {
            id: "message-1",
            campaignId: "campaign-1",
            userId: "dm-1",
            type: "PLAYER",
            content: "The gate is sealed.",
            createdAt: new Date().toISOString(),
            user: { displayName: "CozyVTT Admin" },
            metadata: {
              speakerName: "Ashfang",
              controlledByUserId: "dm-1",
            },
          } as unknown as Message
        }
      />,
    );

    expect(screen.getByText("Ashfang (via You)")).toBeInTheDocument();
    expect(screen.getByText("The gate is sealed.")).toBeInTheDocument();
    expect(screen.queryByText(/controlledByUserId/)).not.toBeInTheDocument();
  });

  it("keeps supplementary metadata collapsed in the activity stream", () => {
    const { container } = render(
      <ChatMessage
        message={
          {
            id: "message-2",
            campaignId: "campaign-1",
            userId: "player-1",
            type: "PLAYER",
            content: "I check the northern door.",
            createdAt: new Date().toISOString(),
            user: { displayName: "Mara" },
            metadata: { language: "Elvish" },
          } as unknown as Message
        }
      />,
    );

    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(container.querySelector("details")).not.toHaveAttribute("open");
  });
});
