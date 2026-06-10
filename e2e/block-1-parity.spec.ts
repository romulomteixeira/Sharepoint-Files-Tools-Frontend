import { expect, test, type Page } from "@playwright/test";

const scan = {
  scanId: "scan-1234567890",
  status: "DONE",
  createdAt: "2026-06-10T10:00:00Z",
  finishedAt: "2026-06-10T10:05:00Z",
  files: 120,
  bytes: 4096,
  sitesAttempted: 2,
};

async function mockAuthenticatedSession(page: Page): Promise<void> {
  await page.route("**/api/session/check", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        username: "homologacao",
        displayName: "Homologação Local",
        role: "admin",
      }),
    }),
  );
  await page.route("**/api/scans/list", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [scan] }),
    }),
  );
  await page.route("**/api/inventory/*/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scanId: scan.scanId,
        totalSites: 2,
        totalDrives: 3,
        totalFiles: 120,
        totalBytes: 4096,
        topExtensions: [{ extension: "pdf", fileCount: 20, totalBytes: 2048 }],
      }),
    }),
  );
  await page.route("**/api/inventory/*/sites*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [{
          siteId: "site-1",
          siteName: "Financeiro",
          siteUrl: "https://tenant/sites/financeiro",
          totalFiles: 120,
          totalBytes: 4096,
          totalDrives: 3,
        }],
        pageInfo: { hasNextPage: false, nextCursor: null },
      }),
    }),
  );
}

test("Relatórios conclui export CSV síncrono sem consultar status", async ({ page }) => {
  await mockAuthenticatedSession(page);
  await page.route("**/api/export/inventory/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/csv; charset=utf-8",
      headers: { "content-disposition": 'attachment; filename="inventory.csv"' },
      body: "name,size\narquivo.pdf,10\n",
    }),
  );

  await page.goto("/reports");
  await page.getByRole("button", { name: /scan-123456789/ }).click();
  await page.getByRole("button", { name: "↓ Gerar exportação CSV" }).click();

  await expect(page.getByText(/Pronto — verifique o histórico/)).toBeVisible();
  await expect(page.getByText("✓ Pronto", { exact: true })).toBeVisible();
});

test("Expurgo de versões renderiza result e preview do backend", async ({ page }) => {
  await mockAuthenticatedSession(page);
  await page.route("**/api/retention/simulate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scanId: scan.scanId,
        result: {
          filesAffected: 1,
          purgeVersions: 4,
          purgeBytes: 8192,
          purgeHuman: "8 KB",
          sitesAffected: 1,
          unknownSizeCount: 0,
          summary: "Manter a versão atual",
        },
        preview: [{
          siteId: "site-1",
          siteName: "Financeiro",
          driveId: "drive-1",
          itemId: "item-1",
          name: "arquivo.pdf",
          extension: "pdf",
          modified: "2026-06-01T10:00:00Z",
          purgeBytes: 8192,
          totalBytes: 12288,
        }],
      }),
    }),
  );

  await page.goto("/expurgo");
  await page.locator("select").first().selectOption(scan.scanId);
  await page.locator("select").nth(1).selectOption("pdf");
  await page.getByRole("button", { name: /Simular — ver arquivos afetados/ }).click();

  await expect(page.getByText("arquivo.pdf")).toBeVisible();
  await expect(page.getByText("Financeiro", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "8.0 KB" })).toBeVisible();
});
