import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { get, postBlob } from "../client";
import { server } from "../../test/server";

describe("client", () => {
  it("aceita respostas JSON legadas sem envelope", async () => {
    server.use(
      http.get("/api/legacy", () => HttpResponse.json({ items: ["ok"] })),
    );

    await expect(get<{ items: string[] }>("/api/legacy")).resolves.toEqual({
      items: ["ok"],
    });
  });

  it("usa a mensagem de erro do contrato legado", async () => {
    server.use(
      http.get("/api/legacy-error", () =>
        HttpResponse.json({ error: "Falha homologada" }, { status: 400 }),
      ),
    );

    await expect(get("/api/legacy-error")).rejects.toMatchObject({
      message: "Falha homologada",
      status: 400,
    });
  });

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
