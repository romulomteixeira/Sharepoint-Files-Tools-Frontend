import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import ScansPage from "../ScansPage";
import { server } from "../../test/server";

describe("ScansPage", () => {
  it("seleciona sites e inicia scan parcial no contrato homologado", async () => {
    let payload: unknown;
    server.use(
      http.get("/api/scans/list", () => HttpResponse.json({ items: [] })),
      http.get("/api/sites", () =>
        HttpResponse.json({
          items: [{
            id: "site-1",
            displayName: "Financeiro",
            webUrl: "https://tenant/sites/financeiro",
          }],
        }),
      ),
      http.post("/api/scans", async ({ request }) => {
        payload = await request.json();
        return HttpResponse.json({ scanId: "scan-12345678" });
      }),
    );

    render(<MemoryRouter><ScansPage /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: /carregar sites/i }));
    const checkbox = await screen.findByRole(
      "checkbox",
      { name: /financeiro/i },
      { timeout: 5000 },
    );
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /scan dos sites selecionados/i }));

    await waitFor(() =>
      expect(payload).toEqual({
        allSites: false,
        sites: ["site-1"],
        options: { enableVersioning: false },
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/scan-123/i);
  });

  it("só lista sites sob demanda e envia busca e quantidade informadas", async () => {
    const requests = vi.fn();
    server.use(
      http.get("/api/scans/list", () => HttpResponse.json({ items: [] })),
      http.get("/api/sites", ({ request }) => {
        const url = new URL(request.url);
        requests(url.searchParams.get("search"), url.searchParams.get("top"));
        return HttpResponse.json({ items: [] });
      }),
    );

    render(<MemoryRouter><ScansPage /></MemoryRouter>);

    expect(requests).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/palavra-chave, nome ou url/i), {
      target: { value: "https://tenant/sites/financeiro" },
    });
    fireEvent.change(screen.getByLabelText(/quantidade a listar/i), {
      target: { value: "125" },
    });
    fireEvent.click(screen.getByRole("button", { name: /carregar sites/i }));

    await waitFor(() =>
      expect(requests).toHaveBeenCalledWith("https://tenant/sites/financeiro", "125"),
    );
  });

  it("preserva a seleção entre páginas da lista carregada", async () => {
    const sites = Array.from({ length: 25 }, (_, index) => ({
      id: `site-${index + 1}`,
      displayName: `Site ${String(index + 1).padStart(2, "0")}`,
      webUrl: `https://tenant/sites/site-${index + 1}`,
    }));
    server.use(
      http.get("/api/scans/list", () => HttpResponse.json({ items: [] })),
      http.get("/api/sites", () => HttpResponse.json({ items: sites })),
    );

    render(<MemoryRouter><ScansPage /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: /carregar sites/i }));
    fireEvent.change(await screen.findByLabelText(/itens\/página/i), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /site 01/i }));
    fireEvent.click(screen.getByRole("button", { name: /próxima/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /site 11/i }));

    expect(screen.getByRole("button", { name: /scan dos sites selecionados \(2\)/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /anterior/i }));
    expect(screen.getByRole("checkbox", { name: /site 01/i })).toBeChecked();
  });
});
