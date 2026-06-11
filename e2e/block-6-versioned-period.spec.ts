import { expect, test } from '@playwright/test';

test('Versionados por Período usa topversioned e sinaliza timeline incompleta', async ({ page }) => {
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
  await page.route('**/api/analytics/topversioned/scan-1?*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      window: 'month',
      field: 'modified',
      anchorIso: '2026-06-10T12:00:00Z',
      startIso: '2026-06-01T00:00:00Z',
      endIso: '2026-07-01T00:00:00Z',
      timelineAvailable: true,
      filesWithTimeline: 1,
      totalVersionedFiles: 2,
      missingTimelineFiles: 1,
      items: [{
        siteId: 'site-1',
        siteName: 'Financeiro',
        driveId: 'drive-1',
        driveName: 'Documentos',
        itemId: 'item-1',
        name: 'orcamento.xlsx',
        fullPath: '/Documentos/orcamento.xlsx',
        sizeBytes: 1024,
        modified: '2026-06-10T10:00:00Z',
        modifiedBy: 'Ana',
        versionCount: 4,
        versionsBytes: 2048,
        totalBytes: 3072,
        metricBytes: 3072,
      }],
    }),
  }));

  await page.goto('/versioned-by-period');
  await page.getByLabel('Scan concluído').selectOption('scan-1');
  await expect(page.getByRole('cell', { name: 'orcamento.xlsx', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Timeline de versões incompleta');
  await page.getByLabel('Filtrar por site, caminho, pessoa ou arquivo').fill('Ana');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^versionados-periodo-\d{4}-\d{2}-\d{2}\.csv$/);
});
