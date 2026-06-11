import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import LicensesPage from '../LicensesPage';
import { server } from '../../test/server';

const report = {
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
};

describe('LicensesPage', () => {
  it('exibe a base contratual recebida e separa Product Name de String ID', async () => {
    server.use(
      http.get('/api/sharepoint/licenses', () => HttpResponse.json(report)),
      http.get('/api/scans/list', () => HttpResponse.json({ items: [] })),
    );

    render(<LicensesPage />);

    expect(await screen.findByText(/Base contratual:/i)).toHaveTextContent(/1000 GB/);
    expect(screen.queryByText(/Base \(1024\)/i)).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Product Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'String ID' })).toBeInTheDocument();

    const officeRow = screen.getByText('Office 365 E3').closest('tr');
    const microsoftRow = screen.getByText('Microsoft 365 E3').closest('tr');
    expect(officeRow).not.toBeNull();
    expect(microsoftRow).not.toBeNull();
    expect(within(officeRow!).getByText('ENTERPRISEPACK')).toBeInTheDocument();
    expect(within(microsoftRow!).getByText('SPE_E3')).toBeInTheDocument();
  });
});
