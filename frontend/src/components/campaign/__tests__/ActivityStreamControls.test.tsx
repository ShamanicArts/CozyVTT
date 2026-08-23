import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ActivityStreamControls from "../ActivityStreamControls";

describe("ActivityStreamControls", () => {
  it("switches semantic views and changes contextual filters", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    const onFiltersChange = vi.fn();
    render(
      <ActivityStreamControls
        mode="general"
        filters={["conversation", "rolls"]}
        eventCount={12}
        onModeChange={onModeChange}
        onFiltersChange={onFiltersChange}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Game Log" }));
    expect(onModeChange).toHaveBeenCalledWith("game");

    await user.click(
      screen.getByRole("button", { name: "Filter General activity" }),
    );
    await user.click(screen.getByRole("checkbox", { name: "Presence" }));
    expect(onFiltersChange).toHaveBeenCalledWith([
      "conversation",
      "rolls",
      "presence",
    ]);
  });
});
