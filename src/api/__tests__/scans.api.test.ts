import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createScan, searchSites } from "../scans.api";
import { server } from "../../test/server";

const envelope = <T>(data: T) =>
  HttpResponse.json({ success: true, data, error: null, meta: {} });

describe("scans.api", () => {
  it("envia busca e limite ao pesquisar sites", async () => {
    server.use(
      http.get("/api/sites", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("search")).toBe("financeiro");
        expect(url.searchParams.get("top")).toBe("25");
        return envelope([
          {
            id: "site-1",
            displayName: "Financeiro",
            webUrl: "https://tenant/sites/financeiro",
          },
        ]);
      }),
    );

    await expect(searchSites("financeiro", 25)).resolves.toEqual([
      {
        id: "site-1",
        displayName: "Financeiro",
        webUrl: "https://tenant/sites/financeiro",
      },
    ]);
  });

  it("mantém siteIds e enableVersioning no payload do scan parcial", async () => {
    server.use(
      http.post("/api/scans", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          siteIds: ["site-1", "site-2"],
          enableVersioning: true,
        });
        return envelope({
          id: "scan-1",
          status: "pending",
          createdAt: "2026-06-09T00:00:00Z",
        });
      }),
    );

    const scan = await createScan({
      siteIds: ["site-1", "site-2"],
      enableVersioning: true,
    });
    expect(scan.id).toBe("scan-1");
  });
});
