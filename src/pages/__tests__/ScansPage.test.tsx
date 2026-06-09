import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
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

    const checkbox = await screen.findByRole("checkbox", { name: /financeiro/i });
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
});
