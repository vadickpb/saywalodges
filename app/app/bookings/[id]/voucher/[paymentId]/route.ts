import { NextResponse } from "next/server";
import { z } from "zod";
import { getBookingsContext } from "@/lib/dal/bookings";
import { getVoucherSignedUrl } from "@/lib/dal/payment-vouchers";

// Opens a stored payment voucher for a member (SD-406). The file is private: this route checks the session, the organization and that
// the payment belongs to this booking, then redirects to a 60-second signed URL. PDFs are served as an attachment (no inline rendering of
// active content in the owner's browser); images open inline. Anyone else gets the same bare 404.
const idSchema = z.string().uuid();
const NOT_FOUND = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const { id, paymentId } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(paymentId).success) return NOT_FOUND();
  try {
    const ctx = await getBookingsContext();
    if (!ctx) return NOT_FOUND();
    const download = new URL(request.url).searchParams.get("descargar") === "1";
    const url = await getVoucherSignedUrl(ctx.supabase, ctx.orgId, paymentId, { bookingId: id, download });
    if (!url) return NOT_FOUND();
    return new NextResponse(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return NOT_FOUND();
  }
}
