import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TopFilesPage from '../TopFilesPage';
import { server } from '../../test/server';

const file = {
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

function renderPage() {
  return render(<MemoryRouter><TopFilesPage /></MemoryRouter>);
}

describe('TopFilesPage', () => {
  it('consome o envelope items e preserva limites independentes por visão', async () => {
    const requests: string[] = [];
    server.use(
      http.get('/api/scans/list', () => HttpResponse.json({
        items: [{ scanId: 'scan-1', status: 'DONE', createdAt: '2026-06-10T12:00:00Z' }],
      })),
      http.get('/api/inventory/:scanId/top-files', ({ request }) => {
        requests.push(request.url);
        return HttpResponse.json({ items: [file] });
      }),
      http.get('/api/inventory/:scanId/top-files-total', ({ request }) => {
        requests.push(request.url);
        return HttpResponse.json({ items: [file] });
      }),
    );

    renderPage();
    fireEvent.change(await screen.findByLabelText('Scan concluído'), { target: { value: 'scan-1' } });
    expect(await screen.findByText('orcamento.xlsx')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Arquivos \+ versões/ }));
    fireEvent.change(screen.getByLabelText('Limite desta visão'), { target: { value: '500' } });

    await waitFor(() => expect(requests.some(url => (
      url.includes('/top-files-total') && url.includes('limit=500')
    ))).toBe(true));

    fireEvent.click(screen.getByRole('tab', { name: /Maiores arquivos/ }));
    expect(screen.getByLabelText('Limite desta visão')).toHaveValue('100');
  });

  it('consulta consolidado por métrica e exibe scan e data de origem', async () => {
    let requestedUrl = '';
    server.use(
      http.get('/api/scans/list', () => HttpResponse.json({ items: [] })),
      http.get('/api/inventory/top-files/latest', ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({
          items: [{
            ...file,
            originScanId: 'scan-latest',
            originScannedAt: '2026-06-11T10:00:00Z',
          }],
        });
      }),
    );

    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Consolidado/ }));
    expect(await screen.findByText('scan-latest')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Ranking consolidado'), { target: { value: 'versions' } });
    await waitFor(() => expect(requestedUrl).toContain('metric=versions'));
    expect(screen.getByText(/11\/06\/2026/)).toBeInTheDocument();
  });
});
