import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./LoginPage";

const login = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    login,
    authenticated: false,
    mfaPending: false,
  }),
}));

vi.mock("@/services/api", () => ({
  api: {
    getRegistrationStatus: vi.fn().mockReturnValue(new Promise(() => {})),
  },
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

function setBrowserAutofillValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  valueSetter?.call(input, value);
}

describe("LoginPage", () => {
  beforeEach(() => {
    login.mockReset();
    login.mockResolvedValue(undefined);
  });

  it("preserves browser-autofilled credentials when remember me is toggled", () => {
    renderLogin();
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    const password = screen.getByLabelText("Password") as HTMLInputElement;

    // Model Safari/password-manager autofill: the live DOM is populated, but
    // React receives no input event and still holds empty controlled state.
    setBrowserAutofillValue(email, "admin@cozyvtt.local");
    setBrowserAutofillValue(password, "test-password");

    fireEvent.click(screen.getByLabelText("Remember me"));

    expect(email).toHaveValue("admin@cozyvtt.local");
    expect(password).toHaveValue("test-password");
  });

  it("submits live browser-autofilled values", () => {
    login.mockReturnValue(new Promise(() => {}));
    renderLogin();
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    setBrowserAutofillValue(email, "admin@cozyvtt.local");
    setBrowserAutofillValue(password, "test-password");

    fireEvent.submit(screen.getByRole("button", { name: "Sign In" }).closest("form")!);

    expect(login).toHaveBeenCalledWith(
      "admin@cozyvtt.local",
      "test-password",
      false,
    );
  });
});
