import "server-only";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { createClient } from "@/lib/supabase/server";
import { paymentAccountSchema, paymentAccountIdSchema, type PaymentAccountInput } from "@/lib/domain/payment-accounts";
import type { Database } from "@/lib/database.types";

export type PaymentAccount = Database["public"]["Tables"]["property_payment_accounts"]["Row"];
const MESSAGE = "No se pudieron gestionar las cuentas de cobro. Actualiza la página y vuelve a intentarlo.";
function fail(code?: string): never {
  console.error("payment_accounts failed:", code ?? "NO_ROW");
  throw new Error(MESSAGE);
}
async function context() {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) fail("NO_CONTEXT");
  const supabase = await createClient();
  const { data, error } = await supabase.from("properties").select("id").eq("org_id", activeOrg.id).maybeSingle();
  if (error || !data) fail(error?.code);
  return { supabase, orgId: activeOrg.id, propertyId: data.id };
}
export async function listPaymentAccounts(): Promise<PaymentAccount[]> {
  const { supabase, orgId, propertyId } = await context();
  const { data, error } = await supabase.from("property_payment_accounts").select("*")
    .eq("org_id", orgId).eq("property_id", propertyId).order("sort_order").order("created_at").order("id");
  if (error || !data) fail(error?.code);
  return data;
}
export async function savePaymentAccount(id: string | null, input: PaymentAccountInput) {
  const value = paymentAccountSchema.parse(input);
  if (id !== null) paymentAccountIdSchema.parse(id);
  const { supabase, orgId, propertyId } = await context();
  const query = id === null
    ? supabase.from("property_payment_accounts").insert({ ...value, org_id: orgId, property_id: propertyId })
    : supabase.from("property_payment_accounts").update(value).eq("org_id", orgId).eq("property_id", propertyId).eq("id", id);
  const { data, error } = await query.select("id");
  if (error || data?.length !== 1) fail(error?.code);
}
export async function setPaymentAccountActive(id: string, active: boolean) {
  paymentAccountIdSchema.parse(id);
  const { supabase, orgId, propertyId } = await context();
  const { data, error } = await supabase.from("property_payment_accounts").update({ active })
    .eq("org_id", orgId).eq("property_id", propertyId).eq("id", id).select("id");
  if (error || data?.length !== 1) fail(error?.code);
}
export async function deletePaymentAccount(id: string) {
  paymentAccountIdSchema.parse(id);
  const { supabase, orgId, propertyId } = await context();
  const { data, error } = await supabase.from("property_payment_accounts").delete()
    .eq("org_id", orgId).eq("property_id", propertyId).eq("id", id).select("id");
  if (error || data?.length !== 1) fail(error?.code);
}
