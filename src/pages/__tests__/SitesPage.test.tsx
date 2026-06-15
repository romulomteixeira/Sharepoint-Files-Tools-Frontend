import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import SitesPage from '../SitesPage';
import { server } from '../../test/server';

function site(index: number) {
  return {
    siteId: `site-${index}`,
    siteName: `Site ${index}`,
    siteUrl: `https://tenant/sites/site-${index}`,
    filesCount: index,
    bytesTotal: 1024 * index,
    versionsBytesTotal: 512 * index,
    totalBytes: 1536 * index,
    scanId: `scan-${index}`,
    scannedAt: '2026-06-10T12:00:00Z',
  };
}

describe('SitesPage', () => {
  it('busca e pagina o inventário latest com quantidade explícita', async () => {
    let requestedUrl = '';
    server.use(
      http.get('/api/inventory/sites/latest', ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({
          page: 1,
          pageSize: 30,
          total: 1,
          totalPages: 1,
          items: [site(1)],
        });
      }),
    );

    render(<SitesPage />);
    await screen.findByText('Site 1');

    fireEvent.change(screen.getByLabelText('Nome, URL ou ID do site'), { target: { value: 'financeiro' } });
    fireEvent.change(screen.getByLabelText('Sites por página'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => {
      expect(requestedUrl).toContain('search=financeiro');
      expect(requestedUrl).toContain('pageSize=30');
    });
  });

  it('desabilita drill-down acima de 10 sites selecionados', async () => {
    server.use(
      http.get('/api/inventory/sites/latest', () => HttpResponse.json({
        page: 1,
        pageSize: 50,
        total: 11,
        totalPages: 1,
        items: Array.from({ length: 11 }, (_, index) => site(index + 1)),
      })),
    );

    render(<SitesPage />);
    await screen.findByText('Site 11');
    fireEvent.click(screen.getByLabelText('Selecionar sites da página'));

    expect(screen.getByRole('button', { name: 'Abrir drill-down' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('no máximo 10 sites');
  });

  it('carrega bibliotecas e métricas de arquivos sob demanda', async () => {
    server.use(
      http.get('/api/inventory/sites/latest', () => HttpResponse.json({
        page: 1,
        pageSize: 50,
        total: 1,
        totalPages: 1,
        items: [site(1)],
      })),
      http.get('/api/inventory/sites/latest/:siteId/files', ({ params }) => HttpResponse.json({
        site: { ...site(1), siteId: params.siteId },
        page: 1,
        pageSize: 50,
        totalFiles: 1,
        totalPages: 1,
        libraries: [{
          driveId: 'drive-1',
          driveName: 'Documentos',
          files: [{
            scanId: 'scan-1',
            siteId: 'site-1',
            siteName: 'Site 1',
            siteUrl: 'https://tenant/sites/site-1',
            driveId: 'drive-1',
            driveName: 'Documentos',
            itemId: 'item-1',
            name: 'contrato.pdf',
            extension: 'pdf',
            fullPath: '/Documentos/contrato.pdf',
            sizeBytes: 1024,
            created: '2026-06-01T10:00:00Z',
            modified: '2026-06-10T10:00:00Z',
            createdBy: 'Ana',
            modifiedBy: 'Ana',
            versionCount: 4,
            versionsBytes: 2048,
            totalBytes: 3072,
          }],
        }],
      })),
    );

    render(<SitesPage />);
    await screen.findByText('Site 1');
    fireEvent.click(screen.getByLabelText('Selecionar Site 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir drill-down' }));

    expect(await screen.findByText('Documentos')).toBeInTheDocument();
    expect(screen.getByText('contrato.pdf')).toBeInTheDocument();
    expect(screen.getByText('/Documentos/contrato.pdf')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
    expect(screen.getByText('3 KB')).toBeInTheDocument();
  });

  it('envia o pageSize selecionado ao backend no drill-down', async () => {
    const requestedSizes: string[] = [];
    server.use(
      http.get('/api/inventory/sites/latest', () => HttpResponse.json({
        page: 1,
        pageSize: 50,
        total: 1,
        totalPages: 1,
        items: [site(1)],
      })),
      http.get('/api/inventory/sites/latest/:siteId/files', ({ request }) => {
        const size = new URL(request.url).searchParams.get('pageSize') ?? '';
        requestedSizes.push(size);
        return HttpResponse.json({
          site: { ...site(1) },
          page: 1,
          pageSize: Number(size) || 50,
          totalFiles: 1,
          totalPages: 1,
          libraries: [{ driveId: 'drive-1', driveName: 'Documentos', files: [] }],
        });
      }),
    );

    render(<SitesPage />);
    await screen.findByText('Site 1');
    fireEvent.click(screen.getByLabelText('Selecionar Site 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir drill-down' }));

    await screen.findByText('Documentos');
    expect(requestedSizes).toContain('50');

    fireEvent.change(screen.getByLabelText('Itens por página'), { target: { value: '200' } });

    await waitFor(() => {
      expect(requestedSizes).toContain('200');
    });
  });
});
