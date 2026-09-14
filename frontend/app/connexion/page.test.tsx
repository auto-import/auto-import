// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  completeTwoFactor: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => mocks }));
vi.mock("@/components/I18nProvider", () => ({
  useI18n: () => ({
    locale: "fr",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));
import LoginPage from "./page";

describe("Login second-factor step", () => {
  afterEach(cleanup);
  beforeEach(() => vi.clearAllMocks());
  function credentials() {
    fireEvent.change(document.getElementById("email")!, {
      target: { value: "fixture@example.test" },
    });
    fireEvent.change(document.getElementById("password")!, {
      target: { value: "fixture-password" },
    });
    fireEvent.submit(document.querySelector("form")!);
  }
  it("keeps password-only login unchanged", async () => {
    mocks.login.mockResolvedValue(undefined);
    render(<LoginPage />);
    credentials();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
    expect(mocks.completeTwoFactor).not.toHaveBeenCalled();
  });
  it("waits for the authenticator or recovery code before navigating", async () => {
    mocks.login.mockResolvedValue({
      twoFactorRequired: true,
      challengeToken: "temporary-challenge",
      expiresAt: "2026-09-14",
    });
    mocks.completeTwoFactor.mockResolvedValue(undefined);
    render(<LoginPage />);
    credentials();
    expect(
      await screen.findByLabelText("Code authenticator (6 chiffres)"),
    ).toBeTruthy();
    expect(document.getElementById("password")).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Utiliser un code de récupération" }),
    );
    fireEvent.change(screen.getByLabelText("Code de récupération"), {
      target: { value: "recovery-fixture" },
    });
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() =>
      expect(mocks.completeTwoFactor).toHaveBeenCalledWith(
        "temporary-challenge",
        "recovery-fixture",
      ),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/");
  });
});
