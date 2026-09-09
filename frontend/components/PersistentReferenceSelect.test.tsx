// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PersistentReferenceSelect from "./PersistentReferenceSelect";
afterEach(cleanup);
it("requires a port code and selects only the UUID returned after successful persistence", async () => {
  const create = vi.fn().mockResolvedValue("port-from-api");
  const onChange = vi.fn();
  render(
    <PersistentReferenceSelect
      label="Port de départ"
      value=""
      options={[]}
      loading={false}
      error=""
      retry={vi.fn()}
      onChange={onChange}
      create={create}
      port
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un port" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nom du port" }), {
    target: { value: "Ningbo" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer le port" }));
  expect(create).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("code du port");
  fireEvent.change(screen.getByRole("textbox", { name: "Code du port" }), {
    target: { value: "CNNGB" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer le port" }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith("port-from-api"));
  expect(create).toHaveBeenCalledWith({
    name: "Ningbo",
    code: "CNNGB",
    country: "",
  });
  expect(screen.getByRole("status").textContent).toBe("Valeur enregistrée.");
});
