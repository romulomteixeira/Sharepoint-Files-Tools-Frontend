import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { cancelScan, createScan, listScans, searchSites } from "../scans.api";
import { server } from "../../test/server";

describe("scans.api", () => {
  it("envia busca e limite ao pesquisar sites", async () => {
    server.use(
      http.get("/api/sites", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("search")).toBe("financeiro");
        expect(url.searchParams.get("top")).toBe("25");
        return HttpResponse.json({
          items: [{
            id: "site-1",
            displayName: "Financeiro",
            webUrl: "https://tenant/sites/financeiro",
          }],
          note: "resultado do Graph",
        });
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

  it("adapta siteIds ao contrato homologado do scan parcial", async () => {
    server.use(
      http.post("/api/scans", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          allSites: false,
          sites: ["site-1", "site-2"],
          options: { enableVersioning: true, quickMode: null },
        });
        return HttpResponse.json({ scanId: "scan-1" });
      }),
    );

    const scan = await createScan({
      siteIds: ["site-1", "site-2"],
      enableVersioning: true,
    });
    expect(scan.id).toBe("scan-1");
    expect(scan.status).toBe("pending");
  });

  it("envia escopo completo, limite e preset de estimativa", async () => {
    server.use(
      http.post("/api/scans", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          allSites: true,
          siteSearch: "projetos",
          maxSites: 12000,
          options: {
            enableVersioning: false,
            quickMode: { maxSites: 30, maxDrivesPerSite: 8, maxItemsPerDrive: 4000 },
          },
        });
        return HttpResponse.json({ scanId: "scan-estimate" });
      }),
    );

    await expect(createScan({
      allSites: true,
      siteSearch: "projetos",
      maxSites: 12000,
      mode: "estimate",
    })).resolves.toEqual(expect.objectContaining({ id: "scan-estimate" }));
  });

  it("cancela usando o scanId no endpoint homologado", async () => {
    let cancelledPath = "";
    server.use(
      http.post("/api/scans/:scanId/cancel", ({ params }) => {
        cancelledPath = String(params.scanId);
        return HttpResponse.json({ ok: true });
      }),
    );

    await cancelScan("scan-running");
    expect(cancelledPath).toBe("scan-running");
  });

  it("normaliza a lista legada de scans", async () => {
    server.use(
      http.get("/api/scans/list", () =>
        HttpResponse.json({
          items: [{
            scanId: "scan-2",
            status: "DONE",
            createdAt: "2026-06-09T00:00:00Z",
            sitesAttempted: 2,
            files: 10,
            bytes: 2048,
            request: { allSites: false, sites: ["site-1", "site-2"] },
          }],
        }),
      ),
    );

    await expect(listScans()).resolves.toEqual([
      expect.objectContaining({
        id: "scan-2",
        status: "completed",
        totalSites: 2,
        totalFiles: 10,
        totalBytes: 2048,
      }),
    ]);
  });
});
