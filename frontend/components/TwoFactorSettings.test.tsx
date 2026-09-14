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
  status: vi.fn(),
  setup: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("@/lib/two-factor-api", () => ({ twoFactorApi: mocks }));
vi.mock("./AuthProvider", () => ({
  useAuth: () => ({ logout: mocks.logout }),
}));
vi.mock("next/image", () => ({
  default: ({
    unoptimized: _unoptimized,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    <img {...props} />
  ),
}));
import TwoFactorSettings from "./TwoFactorSettings";

describe("2FA profile flow", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status.mockResolvedValue({
      enabled: false,
      recoveryCodesRemaining: 0,
    });
    mocks.setup.mockResolvedValue({
      secret: "SECRET-FIXTURE",
      qrCodeDataUrl: "data:image/png;base64,AA==",
      provisioningUri: "otpauth://totp/test",
    });
    mocks.enable.mockResolvedValue({
      enabled: true,
      recoveryCodes: ["RECOVERY-ONE", "RECOVERY-TWO"],
    });
  });
  it("shows the local QR/manual secret, requires verification and displays recovery codes only after success", async () => {
    render(<TwoFactorSettings />);
    fireEvent.change(await screen.findByLabelText("Mot de passe actuel"), {
      target: { value: "current-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Configurer la 2FA" }));
    expect(
      await screen.findByAltText("QR code de configuration authenticator"),
    ).toBeTruthy();
    expect(screen.getByText("SECRET-FIXTURE")).toBeTruthy();
    expect(mocks.enable).not.toHaveBeenCalled();
    expect(screen.queryByText("RECOVERY-ONE")).toBeNull();
    fireEvent.change(screen.getByLabelText("Code authenticator (6 chiffres)"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Vérifier et activer" }),
    );
    expect(await screen.findByText("RECOVERY-ONE")).toBeTruthy();
    expect(screen.queryByText("SECRET-FIXTURE")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /J’ai enregistré mes codes/ }),
    );
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("RECOVERY-ONE")).toBeNull();
  });
  it("keeps the setup inactive when the verification fails", async () => {
    mocks.enable.mockRejectedValue(new Error("Code incorrect"));
    render(<TwoFactorSettings />);
    fireEvent.change(await screen.findByLabelText("Mot de passe actuel"), {
      target: { value: "current-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Configurer la 2FA" }));
    fireEvent.change(
      await screen.findByLabelText("Code authenticator (6 chiffres)"),
      { target: { value: "000000" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Vérifier et activer" }),
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Code incorrect",
    );
    expect(screen.queryByText("RECOVERY-ONE")).toBeNull();
    expect(mocks.logout).not.toHaveBeenCalled();
  });
});
