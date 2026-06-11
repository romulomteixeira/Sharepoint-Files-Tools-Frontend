import { expect, test } from '@playwright/test';

test('Sites lista latest-wins e abre drill-down de biblioteca', async ({ page }) => {
  await page.route('**/api/session/check', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, username: 'homologacao', role: 'admin' }),
  }));
  await page.route('**/api/inventory/sites/latest?*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1,
      items: [{
        siteId: 'site-1',
        siteName: 'Financeiro',
        siteUrl: 'https://tenant/sites/financeiro',
        filesCount: 1,
        bytesTotal: 1024,
        versionsBytesTotal: 2048,
        totalBytes: 3072,
        scanId: 'scan-latest',
        scannedAt: '2026-06-10T12:00:00Z',
      }],
    }),
  }));
  await page.route('**/api/inventory/sites/latest/site-1/files?*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      site: {
        siteId: 'site-1',
        siteName: 'Financeiro',
        siteUrl: 'https://tenant/sites/financeiro',
        scanId: 'scan-latest',
        scannedAt: '2026-06-10T12:00:00Z',
      },
      page: 1,
      pageSize: 50,
      totalFiles: 1,
      totalPages: 1,
      libraries: [{
        driveId: 'drive-1',
        driveName: 'Documentos',
        files: [{
          scanId: 'scan-latest',
          siteId: 'site-1',
          siteName: 'Financeiro',
          siteUrl: 'https://tenant/sites/financeiro',
          driveId: 'drive-1',
          driveName: 'Documentos',
          itemId: 'item-1',
          name: 'orcamento.xlsx',
          extension: 'xlsx',
          fullPath: '/Documentos/orcamento.xlsx',
          sizeBytes: 1024,
          versionCount: 3,
          versionsBytes: 2048,
          totalBytes: 3072,
        }],
      }],
    }),
  }));

  await page.goto('/sites');
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
  await expect(page.getByText('scan-latest').first()).toBeVisible();
  await page.getByLabel('Selecionar Financeiro').check();
  await page.getByRole('button', { name: 'Abrir drill-down' }).click();
  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'orcamento.xlsx', exact: true })).toBeVisible();
  await expect(page.getByText('/Documentos/orcamento.xlsx')).toBeVisible();
});

test('Realizar Scans preserva a rota e as funcionalidades existentes', async ({ page }) => {
  await page.route('**/api/session/check', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, username: 'homologacao', role: 'admin' }),
  }));
  await page.route('**/api/scans/list', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [] }),
  }));

  await page.goto('/scans');
  await expect(page.getByRole('heading', { name: 'Realizar Scans' })).toBeVisible();
  await expect(page).toHaveURL(/\/scans$/);
  await expect(page.getByRole('heading', { name: 'Iniciar novo scan' })).toBeVisible();
});
