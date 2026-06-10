import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import {
  requestPurgeToken,
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
          operation: "retention_versions",
          scanId: "scan-1",
          keepVersions: 10,
        });
        return envelope({
          confirmToken: "token",
          expiresAt: "2026-06-09T01:00:00Z",
          requestHash: "hash",
        });
      }),
    );

    await expect(
      requestPurgeToken("retention_versions", {
        scanId: "scan-1",
        keepVersions: 10,
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
});
