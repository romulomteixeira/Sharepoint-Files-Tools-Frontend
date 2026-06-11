import { expect, test } from '@playwright/test';

test('Top Arquivos alterna métricas, consolidado e exporta o filtro exibido', async ({ page }) => {
  await page.route('**/api/session/check', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, username: 'homologacao', role: 'admin' }),
  }));
  await page.route('**/api/scans/list', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      items: [{ scanId: 'scan-1', status: 'DONE', createdAt: '2026-06-10T12:00:00Z' }],
    }),
  }));

  const item = {
    scanId: 'scan-1',
    siteId: 'site-1',
    siteName: 'Financeiro',
    driveId: 'drive-1',
    driveName: 'Documentos',
    itemId: 'item-1',
    name: 'orcamento.xlsx',
    extension: 'xlsx',
    fullPath: '/Documentos/orcamento.xlsx',
    sizeBytes: 1024,
    modified: '2026-06-10T12:00:00Z',
    versionCount: 4,
    versionsBytes: 2048,
    totalBytes: 3072,
  };
  await page.route('**/api/inventory/scan-1/top-*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [item] }),
  }));
  await page.route('**/api/inventory/top-files/latest?*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      items: [{
        ...item,
        originScanId: 'scan-latest',
        originScannedAt: '2026-06-11T10:00:00Z',
      }],
    }),
  }));

  await page.goto('/top-files');
  await page.getByLabel('Scan concluído').selectOption('scan-1');
  await expect(page.getByRole('cell', { name: /orcamento.xlsx/ })).toBeVisible();

  await page.getByRole('tab', { name: /Arquivos \+ versões/ }).click();
  await expect(page.getByRole('cell', { name: '3.0 KB', exact: true })).toBeVisible();

  await page.getByRole('tab', { name: /Consolidado/ }).click();
  await page.getByLabel('Ranking consolidado').selectOption('versions');
  await expect(page.getByText('scan-latest')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^top-arquivos-latest-\d{4}-\d{2}-\d{2}\.csv$/);
});
