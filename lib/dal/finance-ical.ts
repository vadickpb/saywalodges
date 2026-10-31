import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { completeRentalResultSchema, type CompleteRentalForm, type PendingRental } from "@/lib/domain/finance-ical";

// Imported Airbnb/Booking stays waiting for an income (SD-807), OWNER only: the RPCs
// check the role and the org inside the database, RLS is the second barrier. Session
// client only; orgId comes from requireActiveOrg(). The private iCal event id never
// reaches this layer: a stay is identified by its calendar block id. Failures are
// logged and reported as a generic {ok:false}.

type Client = SupabaseClient<Database>;
type Result<T = object> = ({ ok: true } & T) | { ok: false };

export async function listRentalsToComplete(supabase: Client, orgId: string): Promise<PendingRental[]> {
  const { data, error } = await supabase.rpc("list_ical_rentals_to_complete", { p_org_id: orgId });
  if (error) {
    console.error("listRentalsToComplete failed:", error);
    throw new Error("No se pudieron cargar los alquileres por completar.");
  }
  return data.flatMap((r) =>
    r.channel === "airbnb" || r.channel === "booking"
      ? [{
          blockId: r.block_id,
          unitId: r.unit_id,
          unitName: r.unit_name,
          channel: r.channel,
          stayStart: r.stay_start,
          stayEnd: r.stay_end,
          suggestedCleaningCents: r.suggested_cleaning_cents,
          currency: r.currency,
        }]
      : []
  );
}

// Idempotent in the database: completing the same stay twice returns the first rental
// (replayed: true) instead of writing another income.
export async function completeRental(supabase: Client, orgId: string, input: CompleteRentalForm): Promise<Result<{ rentalId: string; replayed: boolean }>> {
  const { data, error } = await supabase.rpc("complete_ical_rental", {
    p_org_id: orgId,
    p_block_id: input.blockId,
    p_amount_cents: input.amount,
    p_currency: input.currency,
    p_occurred_on: input.occurredOn,
    p_fx_rate_pen: input.fxRate === undefined ? undefined : Number(input.fxRate),
    p_guests: input.guests,
    p_cleaning_cents: input.cleaning,
  });
  const parsed = completeRentalResultSchema.safeParse(data);
  if (error || !parsed.success) {
    console.error("completeRental failed:", error ?? "unexpected response");
    return { ok: false };
  }
  return { ok: true, rentalId: parsed.data.rental_id, replayed: parsed.data.replayed };
}
