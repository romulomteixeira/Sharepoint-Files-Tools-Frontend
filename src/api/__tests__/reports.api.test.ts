import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { exportInventory, getExportJobStatus } from "../reports.api";
import { server } from "../../test/server";

describe("reports.api", () => {
  it("trata CSV síncrono como arquivo e envia o filtro ext", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:csv");
    server.use(
      http.get("/api/export/inventory/:scanId", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("format")).toBe("csv");
        expect(url.searchParams.get("ext")).toBe("pdf");
        expect(url.searchParams.has("extension")).toBe(false);
        return new HttpResponse("name,size\nfile.pdf,10\n", {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": 'attachment; filename="inventory.csv"',
          },
        });
      }),
    );

    await expect(exportInventory({
      scanId: "scan-1",
      format: "csv",
      extension: "pdf",
      limit: 100,
    })).resolves.toMatchObject({
      status: "completed",
      format: "csv",
      downloadUrl: "blob:csv",
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0]).toMatchObject({
      size: 22,
      type: "text/csv;charset=utf-8",
    });
    createObjectURL.mockRestore();
  });

  it("trata JSONL síncrono como arquivo sem executar JSON.parse", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:jsonl");
    server.use(
      http.get("/api/export/inventory/:scanId", () =>
        new HttpResponse('{"name":"a"}\n{"name":"b"}\n', {
          headers: { "content-type": "application/jsonl; charset=utf-8" },
        }),
      ),
    );

    await expect(exportInventory({
      scanId: "scan-1",
      format: "jsonl",
      limit: 100,
    })).resolves.toMatchObject({
      status: "completed",
      format: "jsonl",
      downloadUrl: "blob:jsonl",
    });
    createObjectURL.mockRestore();
  });

  it("normaliza a criação e o status aninhado do job assíncrono", async () => {
    server.use(
      http.get("/api/export/inventory/:scanId", () =>
        HttpResponse.json({
          jobId: "job-1",
          async: true,
          downloadUrl: "/api/export/download/job-1",
        }, { status: 202 }),
      ),
      http.get("/api/jobs/:jobId/status", () =>
        HttpResponse.json({
          jobId: "job-1",
          type: "export_inventory",
          progress: {
            status: "DONE",
            createdAt: "2026-06-10T10:00:00Z",
            finishedAt: "2026-06-10T10:01:00Z",
          },
        }),
      ),
    );

    await expect(exportInventory({
      scanId: "scan-1",
      format: "jsonl",
    })).resolves.toMatchObject({
      jobId: "job-1",
      status: "pending",
      format: "jsonl",
    });
    await expect(getExportJobStatus("job-1")).resolves.toMatchObject({
      jobId: "job-1",
      status: "completed",
      finishedAt: "2026-06-10T10:01:00Z",
    });
  });
});
