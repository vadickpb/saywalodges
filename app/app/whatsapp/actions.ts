"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/modules";
import { markInboxRead } from "@/lib/dal/whatsapp-inbox-read";

export async function markInboxReadAction(): Promise<void> {
  requireModule("whatsapp");
  await markInboxRead();
  revalidatePath("/app/whatsapp");
}
