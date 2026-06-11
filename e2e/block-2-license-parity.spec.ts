import { expect, test } from '@playwright/test';

test('Licenças exibe base decimal e distingue Product Name de String ID', async ({ page }) => {
  await page.route('**/api/session/check', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      username: 'homologacao',
      displayName: 'Homologação Local',
      role: 'admin',
    }),
  }));
  await page.route('**/api/scans/list', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [] }),
  }));
  await page.route('**/api/sharepoint/licenses', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      licenses: {
        ok: true,
        note: 'Estimativa baseada em 1 TB decimal (1000 GB).',
        skuCountScanned: 2,
        totals: {
          baseCapacityGb: 1000,
          licensesCapacityGb: 80,
          totalCapacityGb: 1080,
        },
        skus: [
          {
            skuPartNumber: 'ENTERPRISEPACK',
            skuPopularName: 'Office 365 E3',
            skuId: 'office-e3',
            matchedBy: 'servicePlan',
            consumedUnits: 5,
            prepaidEnabled: 5,
            prepaidSuspended: 0,
            prepaidWarning: 0,
            unitsForCapacityCalc: 5,
            capacityContributionGb: 50,
          },
          {
            skuPartNumber: 'SPE_E3',
            skuPopularName: 'Microsoft 365 E3',
            skuId: 'microsoft-e3',
            matchedBy: 'servicePlan',
            consumedUnits: 3,
            prepaidEnabled: 3,
            prepaidSuspended: 0,
            prepaidWarning: 0,
            unitsForCapacityCalc: 3,
            capacityContributionGb: 30,
          },
        ],
      },
    }),
  }));

  await page.goto('/licenses');

  await expect(page.getByText('Base contratual:')).toContainText('1000 GB');
  await expect(page.getByRole('columnheader', { name: 'Product Name' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'String ID' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Office 365 E3' })).toContainText('ENTERPRISEPACK');
  await expect(page.getByRole('row').filter({ hasText: 'Microsoft 365 E3' })).toContainText('SPE_E3');
});
