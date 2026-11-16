import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { validateDemoData, PRIVATE_BUCKETS, DEMO_GUIDE_PASSWORD, DEMO_GUIDE_TOKEN, DEMO_ORG_ID, DEMO_PROPERTY_ID, DEMO_STAFF_EMAIL, INSERT_ORDER, TABLE_OF, buildDemoData } from "./demo-data.mjs";

const today = new Date("2026-11-03T05:00:00Z");
const data = buildDemoData(today, { rootDomain: "demo.example.org" });
const rows = (k) => [].concat(data[k]);

describe("demo data", () => {
  it("every row belongs to the demo organization (so deleting it removes everything)", () => {
    for (const k of INSERT_ORDER.filter((x) => x !== "organization")) {
      for (const r of rows(k)) expect(r.org_id, k).toBe(DEMO_ORG_ID);
    }
    expect(data.organization.id).toBe(DEMO_ORG_ID);
    expect(data.membership.org_id).toBe(DEMO_ORG_ID);
  });
  it("is published, fictional and never an owner", () => {
    expect(data.property.published).toBe(true);
    expect(data.property.id).toBe(DEMO_PROPERTY_ID);
    expect(data.membership.role).toBe("staff");
    expect(DEMO_STAFF_EMAIL).toBe("demo-staff@example.com");
    expect(data.house_guides[0].published).toEqual(data.house_guides[0].draft);
  });
  it("contains nothing from the real Saywa Lodges", () => {
    const text = JSON.stringify(data).toLowerCase();
    for (const real of ["51963416766", "saywalodges", "urubamba", "reservas@"]) expect(text).not.toContain(real);
    for (const guest of data.guests) {
      expect(guest.email).toMatch(/@example\.com$/);
      expect(guest.phone).toBeNull();
    }
  });
  it("has twelve months of past and future confirmed reservations", () => {
    expect(data.bookings).toHaveLength(12);
    expect(data.payments).toHaveLength(12);
    expect(data.guests).toHaveLength(12);
    expect(data.quotes).toHaveLength(12);
    const todayIso = "2026-11-03";
    expect(data.bookings.some((booking) => booking.check_out < todayIso)).toBe(true);
    expect(data.bookings.some((booking) => booking.check_in > todayIso)).toBe(true);
    expect(new Set(data.bookings.map((booking) => booking.check_in.slice(0, 7))).size).toBe(12);
    for (const booking of data.bookings) {
      expect(booking.status).toBe("confirmed");
      expect(data.guests.some((guest) => guest.id === booking.guest_id)).toBe(true);
      expect(data.quotes.some((quote) => quote.id === booking.quote_id)).toBe(true);
      expect(data.calendar_blocks.some((block) => block.booking_id === booking.id && block.period === `[${booking.check_in},${booking.check_out})`)).toBe(true);
      const payment = data.payments.find((candidate) => candidate.booking_id === booking.id);
      expect(payment?.status).toBe("approved");
      expect(payment?.amount_cents).toBe(booking.total_cents);
      expect(new Date(booking.created_at).getTime()).toBeLessThanOrEqual(new Date(booking.confirmed_at).getTime());
      expect(new Date(booking.confirmed_at).getTime()).toBeLessThanOrEqual(today.getTime());
      const quote = data.quotes.find((candidate) => candidate.id === booking.quote_id);
      expect(new Date(quote.created_at).getTime()).toBeLessThanOrEqual(new Date(booking.created_at).getTime());
    }
  });
  it("keeps every calendar block non-empty and non-overlapping per unit", () => {
    const parsed = data.calendar_blocks.map((block) => {
      const match = /^\[([^,]+),([^\)]+)\)$/.exec(block.period);
      expect(match, block.id).not.toBeNull();
      return { ...block, start: match[1], end: match[2] };
    });
    for (const block of parsed) expect(block.start < block.end).toBe(true);
    for (const unit of data.units) {
      const blocks = parsed.filter((block) => block.unit_id === unit.id).sort((a, b) => a.start.localeCompare(b.start));
      for (let index = 1; index < blocks.length; index += 1) {
        expect(blocks[index - 1].end <= blocks[index].start, `${blocks[index - 1].id} overlaps ${blocks[index].id}`).toBe(true);
      }
    }
    expect(data.calendar_blocks.filter((block) => block.source === "ical")).toHaveLength(4);
  });
  it("has coherent finance totals and linked costs", () => {
    const incomes = data.finance_entries.filter((entry) => entry.kind === "income");
    const expenses = data.finance_entries.filter((entry) => entry.kind === "expense");
    expect(incomes).toHaveLength(12);
    expect(new Set(incomes.map((entry) => entry.channel))).toEqual(new Set(["direct", "airbnb"]));
    expect(expenses.some((entry) => entry.category_key === "platform_commission")).toBe(true);
    expect(expenses.some((entry) => entry.category_key === "cleaning")).toBe(true);
    expect(expenses.some((entry) => entry.category_key === "electricity")).toBe(true);
    for (const income of incomes) {
      const booking = data.bookings.find((candidate) => candidate.check_in === income.stay_start && candidate.unit_id === income.unit_id);
      expect(booking).toBeDefined();
      expect(income.amount_cents).toBe(booking.total_cents);
      const linked = expenses.filter((expense) => expense.related_entry_id === income.id);
      if (booking.check_out <= "2026-11-03") {
        expect(linked.some((expense) => expense.category_key === "cleaning")).toBe(true);
      } else {
        expect(linked.some((expense) => expense.category_key === "cleaning")).toBe(false);
      }
      if (income.channel === "airbnb") {
        expect(linked.find((expense) => expense.category_key === "platform_commission")?.amount_cents).toBe(Math.round(income.amount_cents * 0.15));
      }
    }
    const incomeTotal = incomes.reduce((sum, entry) => sum + entry.amount_cents, 0);
    const expenseTotal = expenses.reduce((sum, entry) => sum + entry.amount_cents, 0);
    const expectedExpenseTotal = incomes.reduce((sum, income) => {
      const cleaning = income.stay_end <= "2026-11-03" ? (income.unit_id === data.units[0].id ? 6500 : 12000) : 0;
      const commission = income.channel === "airbnb" ? Math.round(income.amount_cents * 0.15) : 0;
      return sum + cleaning + commission;
    }, 0) + [0, 1, 2, 3, 4, 5].reduce((sum, index) => sum + 8500 + (index % 3) * 500, 0);
    expect(expenseTotal).toBe(expectedExpenseTotal);
    expect(expenses.every((entry) => entry.occurred_on <= "2026-11-03")).toBe(true);
    expect(incomeTotal - expenseTotal).toBeGreaterThan(0);
    expect(data.payments.reduce((sum, payment) => sum + payment.amount_cents, 0)).toBe(incomeTotal);
  });
  it("publishes a fictional private-guide access for the staff tour", () => {
    expect(DEMO_GUIDE_TOKEN).toHaveLength(43);
    expect(DEMO_GUIDE_PASSWORD).toBe("demo-guide-2026");
    expect(data.house_guide_links).toHaveLength(1);
    expect(data.house_guide_links[0].token_hash).toBe(createHash("sha256").update(DEMO_GUIDE_TOKEN).digest("hex"));
    expect(data.house_guide_links[0].password_hash).not.toContain(DEMO_GUIDE_PASSWORD);
    expect(data.house_guide_links[0].expires_at).toBe("2027-11-03T00:00:00.000Z");
  });
  it("uses unique ids and respects the pricing constraints", () => {
    const ids = INSERT_ORDER.flatMap((k) => rows(k)).map((r) => r.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    const season = data.seasons[0];
    expect(season.end_date > season.start_date).toBe(true);
    expect(season.start_date).toBe("2026-11-03");
    expect(season.end_date).toBe("2027-03-03");
    for (const r of data.unit_rates) {
      expect(data.units.some((u) => u.id === r.unit_id)).toBe(true);
      expect(r.season_id === null || r.season_id === season.id).toBe(true);
    }
    // exactly one base rate (season_id null) per unit, as the unique index requires
    for (const u of data.units) expect(data.unit_rates.filter((r) => r.unit_id === u.id && r.season_id === null)).toHaveLength(1);
    for (const u of data.units) expect(u.included_guests <= u.max_guests).toBe(true);
  });
  it("seasons follow the injected date", () => {
    const later = buildDemoData(new Date("2027-01-10T00:00:00Z"));
    expect(later.seasons[0].start_date).toBe("2027-01-10");
    expect(later.property.custom_domain).toBeNull();
  });
  it("rows of one insert share the same columns (PostgREST bulk insert rejects mixed keys with HTTP 400)", () => {
    for (const k of INSERT_ORDER) {
      const keySets = new Set(rows(k).map((r) => Object.keys(r).sort().join(",")));
      expect(keySets.size, k).toBe(1);
    }
  });
  it("accepts the default data and a valid root domain", () => {
    expect(validateDemoData(buildDemoData(today))).toEqual([]);
    expect(validateDemoData(data)).toEqual([]);
  });
  it.each(["Demo.Example.org", "demo.example.org:3000", "demo.example.org.", "https://demo.example.org", "demo", "-demo.example.org", "demo example.org"])(
    "rejects the root domain %s before anything is deleted",
    (rootDomain) => {
      expect(validateDemoData(buildDemoData(today, { rootDomain })).join()).toMatch(/DEMO_ROOT_DOMAIN/);
    },
  );
  it("uses the root domain as the canonical site URL, and none otherwise", () => {
    expect(data.property.site_url).toBe("https://demo.example.org");
    expect(buildDemoData(today).property.site_url).toBe("");
  });
  it("covers every storage bucket that holds org files, so the nightly reset leaves none behind", () => {
    expect(PRIVATE_BUCKETS).toEqual(["property-photos", "finance-receipts", "payment-vouchers"]);
  });
  it("has a table for every insert group", () => {
    for (const k of INSERT_ORDER) expect(TABLE_OF[k]).toMatch(/^[a-z_]+$/);
  });
});
