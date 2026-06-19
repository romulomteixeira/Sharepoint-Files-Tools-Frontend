import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

// Handler default para o catálogo de filtros de scan — a ScansPage o consulta no
// mount. Como o setup usa onUnhandledRequest: "error", manter um default evita
// que cada teste precise registrá-lo. Testes podem sobrescrever via server.use.
export const server = setupServer(
  http.get("/api/scan-filter-categories", () =>
    HttpResponse.json({
      categories: [],
      filterKeys: [],
      presets: {},
      defaultPreset: "recommended",
      recommended: {},
    }),
  ),
);
