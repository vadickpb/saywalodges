import { test, expect } from "./booking.fixture";

test("guest quotes, books and uploads a voucher; owner confirms and dates stay blocked", async ({ page, browser, stay }) => {
  const quote = async () => {
    await page.goto("/es/cotizar");
    await page.getByLabel("Alojamiento", { exact: true }).selectOption(stay.unitId);
    await page.getByLabel("Llegada", { exact: true }).fill(stay.checkIn);
    await page.getByLabel("Salida", { exact: true }).fill(stay.checkOut);
    await page.getByLabel("Huéspedes", { exact: true }).selectOption("2");
    await page.getByRole("button", { name: "Continuar al precio y la reserva" }).click();
  };
  await quote();
  await expect(page).toHaveURL(/\/es\/reservar\/[a-f0-9]{64}$/);
  await expect(page.getByRole("heading", { name: "Completa tu reserva" })).toBeVisible();
  await expect(page.getByText(stay.unitName, { exact: true })).toBeVisible();
  await page.getByLabel("Nombre completo").fill(stay.guestName);
  await page.getByLabel("Correo electrónico", { exact: true }).fill(stay.email);
  await page.getByLabel("Acepto los términos indicados arriba").check();
  await page.getByRole("button", { name: "Reservar estas fechas", exact: true }).click();
  await expect(page).toHaveURL(/\/es\/reserva\/[a-f0-9]{64}$/);
  const bookingUrl = page.url();
  await expect(page.getByText("Esperando tu pago", { exact: true })).toBeVisible();
  // A tiny real PNG travels through the browser's anonymous Storage upload and server action.
  await page.getByLabel("Comprobante (JPG, PNG, WebP o PDF, máximo 5 MB)", { exact: true }).setInputFiles({
    name: "local-voucher.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=", "base64"),
  });
  await page.getByRole("button", { name: "Enviar comprobante", exact: true }).click();
  await expect(page.getByText("Pago en revisión", { exact: true })).toBeVisible();

  // Separate cookie jars: the owner session must never authorize the guest's journey.
  const owner = await browser.newContext();
  try {
    const dashboard = await owner.newPage();
    await dashboard.goto("http://app.localhost:3410/login");
    await dashboard.getByLabel("Email", { exact: true }).fill("owner@saywalodges.com");
    await dashboard.getByLabel("Password", { exact: true }).fill("devpassword123");
    await dashboard.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(dashboard).toHaveURL(/\/app(?:\/.*)?$/);
    await dashboard.goto("http://app.localhost:3410/app/bookings");
    await dashboard.getByRole("link", { name: "Comprobante por revisar", exact: true }).click();
    await dashboard.getByRole("link").filter({ hasText: stay.guestName }).click();
    await expect(dashboard.getByText(stay.email, { exact: true })).toBeVisible();
    // Check the owner's authenticated voucher endpoint really serves the uploaded image.
    const voucherHref = await dashboard.getByRole("link", { name: "Ver comprobante" }).getAttribute("href");
    expect(voucherHref).toBeTruthy();
    // Navigate in Chromium, which resolves *.localhost without an OS hosts entry.
    const voucherPage = await owner.newPage();
    const voucher = await voucherPage.goto(`http://app.localhost:3410${voucherHref}`);
    expect(voucher?.ok()).toBe(true);
    expect(voucher?.headers()["content-type"]).toContain("image/png");
    await voucherPage.close();
    // The detail has two exchange-rate fields (approve voucher / register payment): target the approval one by its full label.
    await dashboard.getByRole("textbox", { name: "Tipo de cambio (S/ por 1 USD), opcional", exact: true }).fill("3.75");
    await dashboard.getByRole("button", { name: "Aprobar pago", exact: true }).click();
    await dashboard.getByRole("button", { name: "Aprobar y confirmar", exact: true }).click();
    // The detail also has a "Confirmada" timestamp label; assert the status badge.
    await expect(dashboard.getByText("Confirmada", { exact: true }).first()).toBeVisible();
    await expect(dashboard.getByText("Aprobado", { exact: true })).toBeVisible();
  } finally {
    await owner.close();
  }
  await page.goto(bookingUrl);
  await expect(page.getByText("Reserva confirmada", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar comprobante", exact: true })).toHaveCount(0);
  await stay.expectConfirmed();
  // Confirmed dates must remain unavailable to a fresh public quote through the real form/RPC.
  await quote();
  await expect(page.getByRole("region", { name: "Cotiza tu estadía" }).getByRole("alert")).toHaveText("Esas fechas ya no están disponibles. Prueba con otras fechas.");
  await expect(page).toHaveURL(/\/es\/cotizar$/);
});
