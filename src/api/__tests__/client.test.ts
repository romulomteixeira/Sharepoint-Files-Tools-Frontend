import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { postBlob } from "../client";
import { server } from "../../test/server";

describe("client", () => {
  it("propaga 401 de downloads para o contexto de autenticação", async () => {
    const unauthorized = vi.fn();
    window.addEventListener("auth:unauthorized", unauthorized);
    server.use(
      http.post("/api/file-retention/export", () =>
        HttpResponse.json(
          {
            success: false,
            data: null,
            error: { code: "UNAUTHORIZED", message: "Sessão expirada" },
            meta: {},
          },
          { status: 401 },
        ),
      ),
    );

    await expect(
      postBlob("/api/file-retention/export", { scanId: "scan-1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(unauthorized).toHaveBeenCalledOnce();

    window.removeEventListener("auth:unauthorized", unauthorized);
  });
});
