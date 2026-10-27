import { NextResponse } from "next/server";
import { z } from "zod";
import { signReceipt } from "@/lib/dal/finance";
import { getFinanceContext } from "../../_lib/context";

// Receipts live in a PRIVATE bucket. This route authorises at click time with
// the caller's own session (RLS: the owner, or the staff member who created the
// entry), signs a 60-second link with that same session, and redirects to it.
// Nothing is signed with a service role, so a forged receipt_path cannot reach
// another member's file.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new NextResponse(null, { status: 404 });
  const ctx = await getFinanceContext();
  if (!ctx) return new NextResponse(null, { status: 404 });
  const url = await signReceipt(ctx.supabase, ctx.orgId, id, 60);
  if (!url) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(url, 302);
}
