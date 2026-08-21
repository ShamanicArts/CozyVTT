import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DiceRolledEvent } from "@/types";
import DiceResult from "../DiceResult";

function makeRoll(result: number): DiceRolledEvent {
  return {
    userId: "player-1",
    userName: "Mara",
    characterName: "Ashfang",
    expression: "1d20+4",
    result: result + 4,
    purpose: "Open the gate",
    timestamp: new Date().toISOString(),
    breakdown: {
      expression: "1d20+4",
      formula: "1d20 + 4",
      total: result + 4,
      rolls: [
        {
          type: "dice",
          notation: "1d20",
          sides: 20,
          results: [result],
          kept: [result],
          total: result,
        },
        { type: "modifier", value: 4 },
      ],
    },
  };
}

describe("DiceResult activity disclosure", () => {
  it("summarises routine rolls and keeps mechanics collapsed", () => {
    const { container } = render(
      <DiceResult roll={makeRoll(12)} isCurrentUser />,
    );

    expect(screen.getByText("Ashfang")).toBeInTheDocument();
    expect(screen.getByText("1d20+4")).toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument();
    expect(container.querySelector("details")).not.toHaveAttribute("open");
  });

  it("opens consequential rolls and calls out the critical result", () => {
    const { container } = render(
      <DiceResult roll={makeRoll(20)} isCurrentUser={false} />,
    );

    expect(screen.getByText("Critical success")).toBeInTheDocument();
    expect(container.querySelector("details")).toHaveAttribute("open");
  });
});
