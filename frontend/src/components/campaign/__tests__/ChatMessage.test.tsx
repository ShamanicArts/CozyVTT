import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Message } from "@/types";
import ChatMessage from "../ChatMessage";

describe("ChatMessage agent actor identity", () => {
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
});
