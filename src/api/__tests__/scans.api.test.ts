import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { cancelScan, createScan, getScanFilterCatalog, listScans, searchSites } from "../scans.api";
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

  it("envia filtros quando informados no scan completo", async () => {
    let body: unknown;
    server.use(
      http.post("/api/scans", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ scanId: "scan-filtered" });
      }),
    );

    await createScan({
      allSites: true,
      filters: {
        excludeOneDrive: true, excludeSystem: true, excludeArchived: false, excludeNoDrives: true,
        excludeChannelPrivate: false, excludeChannelShared: false, excludeEmbedded: false, excludeSubsites: false,
      },
    });

    expect((body as { filters?: unknown }).filters).toEqual({
      excludeOneDrive: true, excludeSystem: true, excludeArchived: false, excludeNoDrives: true,
      excludeChannelPrivate: false, excludeChannelShared: false, excludeEmbedded: false, excludeSubsites: false,
    });
  });

  it("omite filters do payload quando não informados", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post("/api/scans", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ scanId: "scan-nofilter" });
      }),
    );
    await createScan({ allSites: true });
    expect("filters" in body).toBe(false);
  });

  it("busca o catálogo de categorias de filtro", async () => {
    server.use(
      http.get("/api/scan-filter-categories", () =>
        HttpResponse.json({
          categories: [{ key: "excludeOneDrive", category: "onedrive_personal", label: "OneDrive pessoais", needsDrives: false, needsTeams: false }],
          filterKeys: ["excludeOneDrive"],
          presets: {},
          defaultPreset: "recommended",
          recommended: {},
        }),
      ),
    );
    const catalog = await getScanFilterCatalog();
    expect(catalog.categories[0].key).toBe("excludeOneDrive");
    expect(catalog.defaultPreset).toBe("recommended");
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
