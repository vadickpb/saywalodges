import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

vi.mock("server-only", () => ({}));
import { completeRental, listRentalsToComplete } from "./finance-ical";

const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";
const BLOCK = "7fc45683-5cf1-4bac-8dde-3331b397956c";
const RENTAL = "0bcf73ac-1c1d-4418-9982-2edde9a3e50c";

function fake(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => Promise.resolve(result));
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}
const silent = () => vi.spyOn(console, "error").mockImplementation(() => {});

const row = (over: Record<string, unknown> = {}) => ({
  block_id: BLOCK, unit_id: "u1", unit_name: "Casa A", channel: "airbnb", stay_start: "2027-03-01", stay_end: "2027-03-04",
  suggested_cleaning_cents: 8000, currency: "USD", ...over,
});

describe("listRentalsToComplete", () => {
  it("maps the rows, asks for the session org and exposes no event id", async () => {
    const { client, rpc } = fake({ data: [row(), row({ block_id: "b2", channel: "booking", suggested_cleaning_cents: null })], error: null });
    const stays = await listRentalsToComplete(client, ORG);
    expect(rpc).toHaveBeenCalledWith("list_ical_rentals_to_complete", { p_org_id: ORG });
    expect(stays).toEqual([
      { blockId: BLOCK, unitId: "u1", unitName: "Casa A", channel: "airbnb", stayStart: "2027-03-01", stayEnd: "2027-03-04", suggestedCleaningCents: 8000, currency: "USD" },
      { blockId: "b2", unitId: "u1", unitName: "Casa A", channel: "booking", stayStart: "2027-03-01", stayEnd: "2027-03-04", suggestedCleaningCents: null, currency: "USD" },
    ]);
    expect(JSON.stringify(stays)).not.toMatch(/uid/i);
  });

  it("drops any channel other than Airbnb or Booking", async () => {
    expect(await listRentalsToComplete(fake({ data: [row({ channel: "vrbo" })], error: null }).client, ORG)).toEqual([]);
  });

  it("throws a generic error without the database message", async () => {
    silent();
    await expect(listRentalsToComplete(fake({ data: null, error: { message: "secret db detail" } }).client, ORG)).rejects.toThrow(
      "No se pudieron cargar los alquileres por completar."
    );
  });
});

describe("completeRental", () => {
  const input = { blockId: BLOCK, amount: 15000, currency: "USD" as const, fxRate: "3.75", occurredOn: "2027-03-04", guests: 2, cleaning: 8000 };

  it("sends the owner's figures with the session org and reports whether it was a replay", async () => {
    const { client, rpc } = fake({ data: { rental_id: RENTAL, replayed: false }, error: null });
    expect(await completeRental(client, ORG, input)).toEqual({ ok: true, rentalId: RENTAL, replayed: false });
    expect(rpc).toHaveBeenCalledWith("complete_ical_rental", {
      p_org_id: ORG, p_block_id: BLOCK, p_amount_cents: 15000, p_currency: "USD", p_occurred_on: "2027-03-04",
      p_fx_rate_pen: 3.75, p_guests: 2, p_cleaning_cents: 8000,
    });
    const replay = fake({ data: { rental_id: RENTAL, replayed: true }, error: null });
    expect(await completeRental(replay.client, ORG, input)).toEqual({ ok: true, rentalId: RENTAL, replayed: true });
  });

  it("omits the optional figures that were not typed", async () => {
    const { client, rpc } = fake({ data: { rental_id: RENTAL, replayed: false }, error: null });
    await completeRental(client, ORG, { blockId: BLOCK, amount: 100, currency: "PEN", occurredOn: "2027-03-04" });
    expect(rpc).toHaveBeenCalledWith("complete_ical_rental", expect.objectContaining({ p_fx_rate_pen: undefined, p_guests: undefined, p_cleaning_cents: undefined }));
  });

  it("fails generically on a database error or an unexpected answer", async () => {
    silent();
    expect(await completeRental(fake({ data: null, error: { message: "secret db detail" } }).client, ORG, input)).toEqual({ ok: false });
    expect(await completeRental(fake({ data: { rental_id: "nope" }, error: null }).client, ORG, input)).toEqual({ ok: false });
  });
});
