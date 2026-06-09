import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import {
  requestPurgeToken,
  simulateSiteDeletion,
  simulateVersionRetention,
} from "../purge.api";
import { server } from "../../test/server";

const envelope = <T>(data: T) =>
  HttpResponse.json({ success: true, data, error: null, meta: {} });

describe("purge.api", () => {
  it("envia o corpo flat ao solicitar confirmação", async () => {
    server.use(
      http.post("/api/purge/confirm", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          operation: "retention_sites",
          scanId: "scan-1",
          siteIds: ["site-1"],
        });
        return envelope({
          confirmToken: "token",
          expiresAt: "2026-06-09T01:00:00Z",
          requestHash: "hash",
        });
      }),
    );

    await expect(
      requestPurgeToken("retention_sites", {
        scanId: "scan-1",
        siteIds: ["site-1"],
      }),
    ).resolves.toMatchObject({ confirmToken: "token" });
  });

  it("usa a simulação server-side para retenção de versões", async () => {
    server.use(
      http.post("/api/retention/simulate", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          scanId: "scan-1",
          olderThanDays: 90,
        });
        return envelope({ count: 850, bytes: 4096, items: [] });
      }),
    );

    await expect(
      simulateVersionRetention({ scanId: "scan-1", olderThanDays: 90 }),
    ).resolves.toMatchObject({ count: 850, bytes: 4096 });
  });

  it("documenta o contrato de busca da simulação de sites", async () => {
    server.use(
      http.post("/api/sites/simulate", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          scanId: "scan-1",
          search: "rh",
        });
        return envelope({
          scanId: "scan-1",
          search: "rh",
          preview: [],
          result: { sites: 0, totalBytes: 0, totalBytesHuman: "0 B" },
        });
      }),
    );

    await expect(simulateSiteDeletion("scan-1", "rh")).resolves.toMatchObject({
      search: "rh",
    });
  });
});
