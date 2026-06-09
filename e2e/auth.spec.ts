import { expect, test } from "@playwright/test";

test("usuário sem sessão é encaminhado para o login React", async ({
  page,
}) => {
  await page.route("**/api/scans/list", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        data: null,
        error: { code: "UNAUTHORIZED", message: "Sessão expirada" },
        meta: {},
      }),
    }),
  );
  await page.route("**/api/public/branding", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        loginTitle: "SharePoint Monitor",
        loginSubtitle: "Gestão de arquivos",
      }),
    }),
  );

  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: /sharepoint monitor/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /entrar/i })).toBeVisible();
});
