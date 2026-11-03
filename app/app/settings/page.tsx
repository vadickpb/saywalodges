import { listPaymentAccounts } from "@/lib/dal/payment-accounts";
import { PaymentAccounts } from "@/components/dashboard/payment-accounts";

export default async function SettingsPage() {
  const accounts = await listPaymentAccounts();
  return <PaymentAccounts accounts={accounts} />;
}
