import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATES, EMPTY_HOUSE, SENSITIVE, VARIABLES, dueLabel, dueState, effectiveTemplates, houseInfoSchema, renderMessage,
  templateInputSchema, unknownVariables, variableNames, whatsappLink, type StayContext,
} from "./message-templates";

const house = { ...EMPTY_HOUSE, checkinTime: "14:00", checkoutTime: "11:00", wifiName: "Saywa", wifiPassword: "clave123", doorCode: "4821", locationUrl: "https://maps.app.goo.gl/x", rulesEs: "No fiestas\nSilencio 22:00", rulesEn: "No parties\nQuiet 10pm" };
const ctx = (over: Partial<StayContext> = {}): StayContext => ({
  lang: "es", name: "Ana María Pérez", unit: "Villa I", checkIn: "2030-12-21", checkOut: "2030-12-24", guests: 4, requests: ["crib", "late_checkout"], house, today: "2030-12-21", ...over,
});

describe("renderMessage", () => {
  it("greets with the first name and fills the stay data", () => {
    const r = renderMessage("{saludo}, bienvenida a {villa}. {noches} noches, {huespedes} huéspedes. Hora: {hora_checkin}", ctx());
    expect(r.text).toBe("Hola Ana, bienvenida a Villa I. 3 noches, 4 huéspedes. Hora: 14:00");
    expect(r.missing).toEqual([]);
  });
  it("without a name the greeting is just 'Hola' (messages never block on a missing name)", () => {
    expect(renderMessage("{saludo}!", ctx({ name: null })).text).toBe("Hola!");
    expect(renderMessage("{saludo}!", ctx({ name: null, lang: "en" })).text).toBe("Hi!");
  });
  it("drops a line whose value does not exist instead of sending 'Clave: ' and reports it", () => {
    const r = renderMessage("Hola\nPedidos: {pedidos}\nFin", ctx({ requests: [] }));
    expect(r.text).toBe("Hola\nFin");
    expect(r.missing).toEqual(["pedidos"]);
    const noWifi = renderMessage("WiFi: {wifi_nombre}\nOk", ctx({ house: EMPTY_HOUSE }));
    expect(noWifi.text).toBe("Ok");
    expect(noWifi.missing).toEqual(["wifi_nombre"]);
  });
  it("the special requests are listed in the guest's language", () => {
    expect(renderMessage("{pedidos}", ctx()).text).toBe("Cuna, Salida tarde");
    expect(renderMessage("{pedidos}", ctx({ lang: "en" })).text).toBe("Crib, Late check-out");
  });
  it("fills the Wi-Fi password and the door code only close to the stay", () => {
    const body = "Clave: {wifi_clave} · Puerta: {codigo_puerta}";
    expect(renderMessage(body, ctx({ today: "2030-12-19" })).text).toBe("Clave: clave123 · Puerta: 4821"); // 2 days before
    expect(renderMessage(body, ctx({ today: "2030-12-24" })).text).toContain("4821"); // check-out day
    for (const today of ["2030-11-01", "2030-12-18", "2030-12-25"]) {
      const r = renderMessage(body, ctx({ today }));
      expect(r.text).not.toContain("clave123");
      expect(r.text).not.toContain("4821");
      expect(r.text).toContain("te la envío cerca de tu llegada");
      expect(r.withheld.sort()).toEqual(["codigo_puerta", "wifi_clave"]);
    }
    expect(renderMessage(body, ctx({ lang: "en", today: "2030-11-01" })).text).toContain("I will send it closer to your arrival");
  });
  it("uses the house rules in the right language and keeps their line breaks", () => {
    expect(renderMessage("{reglas}", ctx()).text).toBe("No fiestas\nSilencio 22:00");
    expect(renderMessage("{reglas}", ctx({ lang: "en" })).text).toBe("No parties\nQuiet 10pm");
  });
  it("formats the dates in the guest's language, in UTC (no day shift)", () => {
    expect(renderMessage("{llegada}", ctx()).text).toMatch(/21/);
    expect(renderMessage("{llegada}", ctx({ lang: "en" })).text).toMatch(/Dec/);
  });
  it("leaves an unknown {token} untouched and never collapses real paragraphs", () => {
    expect(renderMessage("a {desconocida} b", ctx()).text).toBe("a {desconocida} b");
    expect(renderMessage("uno\n\ndos", ctx()).text).toBe("uno\n\ndos");
  });
  it("every built-in message renders for both languages with a complete house, using only known variables", () => {
    for (const t of DEFAULT_TEMPLATES) for (const lang of ["es", "en"] as const) {
      const body = lang === "es" ? t.bodyEs : t.bodyEn;
      expect(unknownVariables(body)).toEqual([]);
      const r = renderMessage(body, ctx({ lang }));
      expect(r.missing).toEqual([]);
      expect(r.text).not.toMatch(/\{[a-z_]+\}/);
    }
  });
});

describe("variables", () => {
  it("detects unknown variables (typos) and ignores known ones", () => {
    expect(unknownVariables("{saludo} {nombrre} {villa} {x}")).toEqual(["nombrre", "x"]);
    expect(SENSITIVE.every((s) => variableNames.includes(s))).toBe(true);
    expect(Object.keys(VARIABLES).length).toBeGreaterThan(10);
  });
});

describe("templateInputSchema", () => {
  const ok = { key: "welcome", title: "Bienvenida", bodyEs: "{saludo}", bodyEn: "{saludo}", anchor: "check_in", offsetDays: "0" };
  it("accepts a valid message and coerces the offset", () => {
    expect(templateInputSchema.parse(ok)).toMatchObject({ key: "welcome", anchor: "check_in", offsetDays: 0 });
    expect(templateInputSchema.parse({ ...ok, anchor: "", offsetDays: "" })).toMatchObject({ anchor: null, offsetDays: null });
    expect(templateInputSchema.safeParse({ ...ok, key: "custom_2" }).success).toBe(true);
  });
  it.each([
    { key: "custom_9" }, { key: "nope" }, { title: "" }, { bodyEs: "" }, { bodyEn: "Hola {nombrre}" }, { bodyEs: "x".repeat(2001) },
    { anchor: "noon" }, { offsetDays: "40" }, { anchor: "", offsetDays: "1" }, { anchor: "check_in", offsetDays: "" }, { bodyEs: "a‮b" },
  ])("rejects %o", (patch) => expect(templateInputSchema.safeParse({ ...ok, ...patch }).success).toBe(false));
});

describe("houseInfoSchema", () => {
  it("blank fields are null and a location must be https", () => {
    expect(houseInfoSchema.parse({ checkinTime: "", checkoutTime: "", wifiName: " ", wifiPassword: "", doorCode: "", locationUrl: "", contactPhone: "", rulesEs: "", rulesEn: "" })).toEqual(EMPTY_HOUSE);
    expect(houseInfoSchema.safeParse({ ...EMPTY_HOUSE, locationUrl: "http://x.pe" }).success).toBe(false);
    expect(houseInfoSchema.safeParse({ ...EMPTY_HOUSE, locationUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(houseInfoSchema.safeParse({ ...EMPTY_HOUSE, checkinTime: "25:00" }).success).toBe(false);
    expect(houseInfoSchema.safeParse({ ...EMPTY_HOUSE, contactPhone: "abc" }).success).toBe(false);
  });
});

describe("timing, links and the effective library", () => {
  it("says when a message is due for a stay", () => {
    const stay = { checkIn: "2030-12-21", checkOut: "2030-12-24" };
    expect(dueState({ anchor: "check_in", offsetDays: -3 }, stay, "2030-12-18")).toEqual({ date: "2030-12-18", state: "today" });
    expect(dueState({ anchor: "check_in", offsetDays: -3 }, stay, "2030-12-10")?.state).toBe("upcoming");
    expect(dueState({ anchor: "check_out", offsetDays: 0 }, stay, "2030-12-30")?.state).toBe("past");
    expect(dueState({ anchor: null, offsetDays: null }, stay, "2030-12-18")).toBeNull();
    expect(dueLabel({ anchor: "check_in", offsetDays: -3 })).toBe("3 días antes de la llegada");
    expect(dueLabel({ anchor: "check_out", offsetDays: 1 })).toBe("1 día después de la salida");
    expect(dueLabel({ anchor: "check_in", offsetDays: 0 })).toBe("El día de la llegada");
    expect(dueLabel({ anchor: null, offsetDays: null })).toBe("Cuando tú quieras");
  });
  it("builds a WhatsApp link only for a usable number, with the text encoded", () => {
    expect(whatsappLink("+51 999 888 777", "Hola Ana & Beto\nOk")).toBe("https://wa.me/51999888777?text=Hola%20Ana%20%26%20Beto%0AOk");
    expect(whatsappLink("12345", "Hola")).toBeNull();
    expect(whatsappLink(null, "Hola")).toBeNull();
    expect(whatsappLink("999888777", "")).toBeNull();
  });
  it("the owner's rows replace the built-in text; a custom message is appended; the rest stay default", () => {
    const merged = effectiveTemplates([
      { key: "welcome", title: "Mi bienvenida", bodyEs: "Hola {nombre}", bodyEn: "Hi {nombre}", anchor: null, offsetDays: null },
      { key: "custom_2", title: "Tours", bodyEs: "Tours...", bodyEn: "Tours...", anchor: null, offsetDays: null },
      { key: "bogus", title: "x", bodyEs: "x", bodyEn: "x", anchor: null, offsetDays: null },
    ]);
    expect(merged.map((t) => t.key)).toEqual([...DEFAULT_TEMPLATES.map((d) => d.key), "custom_2"]);
    expect(merged.find((t) => t.key === "welcome")).toMatchObject({ title: "Mi bienvenida", bodyEs: "Hola {nombre}", custom: false });
    expect(merged.find((t) => t.key === "farewell")).toEqual(DEFAULT_TEMPLATES.find((d) => d.key === "farewell"));
    expect(merged.at(-1)).toMatchObject({ key: "custom_2", custom: true });
  });
});
