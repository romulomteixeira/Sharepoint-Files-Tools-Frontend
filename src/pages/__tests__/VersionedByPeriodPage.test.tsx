import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import VersionedByPeriodPage from '../VersionedByPeriodPage';
import { server } from '../../test/server';

describe('VersionedByPeriodPage', () => {
  it('usa topversioned, respeita filtros e avisa timeline incompleta', async () => {
    let requestedUrl = '';
    server.use(
      http.get('/api/scans/list', () => HttpResponse.json({
        items: [{ scanId: 'scan-1', status: 'DONE', createdAt: '2026-06-10T12:00:00Z' }],
      })),
      http.get('/api/analytics/topversioned/:scanId', ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({
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
        });
      }),
    );

    render(<MemoryRouter><VersionedByPeriodPage /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText('Scan concluído'), { target: { value: 'scan-1' } });
    expect(await screen.findByText('orcamento.xlsx')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Timeline de versões incompleta');

    fireEvent.change(screen.getByLabelText('Período'), { target: { value: 'year' } });
    fireEvent.change(screen.getByLabelText('Data de referência'), { target: { value: 'created' } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '300' } });
    await waitFor(() => {
      expect(requestedUrl).toContain('window=year');
      expect(requestedUrl).toContain('field=created');
      expect(requestedUrl).toContain('limit=300');
    });
  });
});
