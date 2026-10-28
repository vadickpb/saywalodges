import { NextResponse } from "next/server";
import { EXPORT_ERRORS } from "@/lib/domain/finance-export";
import { listAllEntries, listCategories } from "@/lib/dal/finance";
import { listReportUnits } from "@/lib/dal/finance-reports";
import { getOrgProperty } from "@/lib/dal/organizations";
import { buildExportModel, parseExportPeriod } from "@/lib/domain/finance-export";
import { renderWorkbook } from "@/lib/finance-xlsx";
import { getFinanceContext } from "../_lib/context";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// A failed export sends the person back to the reports page, where the message is
// shown next to the form that caused it, instead of leaving them on a bare error
// page. The code is one of a fixed list and the address is a fixed relative path:
// nothing from the request (not even its host) is echoed, so it cannot be used to
// redirect anywhere else.
const fail = (code: keyof typeof EXPORT_ERRORS) =>
  new NextResponse(null, { status: 303, headers: { Location: `/app/finance/reports?exportError=${code}`, "Cache-Control": "no-store" } });

// The accountant's workbook (SD-805). Owner-only, like every report: staff, a
// member of another org and a request without an active org all get the same
// empty 404 (an anonymous caller is sent to the login by the session check).
// Everything is read with the caller's own session, so RLS is the authority; the
// org comes from the session, never from the URL. It refuses to hand over a
// partial ledger: a file for the accountant must be complete or not exist.
export async function GET(request: Request) {
  const ctx = await getFinanceContext();
  if (!ctx || !ctx.isOwner) return new NextResponse(null, { status: 404 });

  const parsed = parseExportPeriod(Object.fromEntries(new URL(request.url).searchParams));
  if (parsed === null) return fail("period");

  const [ledger, categories, units, property] = await Promise.all([
    listAllEntries(ctx.supabase, ctx.orgId),
    listCategories(ctx.supabase, ctx.orgId),
    listReportUnits(ctx.supabase, ctx.orgId),
    getOrgProperty(ctx.supabase, ctx.orgId),
  ]);
  if (ledger.truncated) return fail("partial");

  const result = buildExportModel({
    entries: ledger.entries,
    categories,
    units,
    period: parsed.period,
    propertyName: property?.name ?? "",
    now: new Date(),
  });
  if (!result.ok) return fail("invalid");

  const file = await renderWorkbook(result.model);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="saywa-finanzas-${parsed.slug}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
