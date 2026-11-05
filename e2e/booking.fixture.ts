import { randomUUID } from "node:crypto";
import { test as base, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import { localBookingStack } from "../scripts/booking-e2e-env.mjs";

const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";
const PROPERTY = "131583b5-785e-4127-81f0-e097163c5654";

export const test = base.extend<{
  stay: { unitId: string; unitName: string; email: string; guestName: string; checkIn: string; checkOut: string; expectConfirmed: () => Promise<void> };
}>({
  stay: async ({}, run) => {
    const stack = localBookingStack();
    const admin = createClient<Database>(stack.API_URL, stack.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const unitId = randomUUID();
    const unitName = `E2E ${unitId}`;
    const email = `e2e-${unitId}@example.test`;
    // Explicit offsets from the real Lima day: stays remain within the public RPC's 731-day window.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const day = (offset: number) => new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
    const checked = <T extends { error: { code?: string; message: string } | null }>(result: T) => {
      if (result.error) throw new Error(`Local fixture failed (${result.error.code ?? "storage"})`);
      return result;
    };
    try {
      checked(await admin.from("units").insert({ id: unitId, org_id: ORG, property_id: PROPERTY, name: unitName, kind: "entire_place", max_guests: 2, included_guests: 2, active: true }));
      const seasons = checked(await admin.from("seasons").select("id").eq("property_id", PROPERTY)).data ?? [];
      checked(await admin.from("unit_rates").insert([null, ...seasons.map(season => season.id)].map(seasonId => ({ org_id: ORG, property_id: PROPERTY, unit_id: unitId, season_id: seasonId, nightly_cents: 22000, extra_guest_cents: 0, min_nights: 1 }))));
      await run({
        unitId, unitName, email, guestName: `Guest ${unitId}`, checkIn: day(60), checkOut: day(62),
        expectConfirmed: async () => {
          const booking = checked(await admin.from("bookings").select("status, total_cents, expires_at").eq("unit_id", unitId).single()).data;
          expect(booking).toEqual({ status: "confirmed", total_cents: 44000, expires_at: null });
          const block = checked(await admin.from("calendar_blocks").select("period, source, expires_at").eq("unit_id", unitId).single()).data;
          expect(block).toEqual({ period: `[${day(60)},${day(62)})`, source: "booking", expires_at: null });
        },
      });
    } finally {
      // Only this run's UUID-scoped data. No db reset and no edits to the seeded property/rates/accounts.
      const bookings = checked(await admin.from("bookings").select("id, public_token").eq("unit_id", unitId)).data ?? [];
      for (const booking of bookings) {
        const prefix = `${ORG}/${booking.public_token}`;
        const files = checked(await admin.storage.from("payment-vouchers").list(prefix)).data ?? [];
        if (files.length) checked(await admin.storage.from("payment-vouchers").remove(files.map(file => `${prefix}/${file.name}`)));
        checked(await admin.from("payments").delete().eq("booking_id", booking.id));
      }
      checked(await admin.from("finance_entries").delete().eq("unit_id", unitId));
      checked(await admin.from("calendar_blocks").delete().eq("unit_id", unitId));
      checked(await admin.from("bookings").delete().eq("unit_id", unitId));
      checked(await admin.from("quotes").delete().eq("unit_id", unitId));
      checked(await admin.from("units").delete().eq("id", unitId));
      checked(await admin.from("guests").delete().eq("org_id", ORG).eq("email", email));
    }
  },
});
export { expect };
