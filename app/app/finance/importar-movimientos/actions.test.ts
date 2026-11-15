import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/finance", () => ({ listCategories: vi.fn() }));
vi.mock("@/lib/dal/finance-airbnb-import", () => ({ listImportUnits: vi.fn() }));
vi.mock("@/lib/dal/finance-csv-import", () => ({ importFinanceRows: vi.fn() }));
vi.mock("../_lib/context", () => ({
  getFinanceContext: vi.fn(),
  GENERIC_ERROR: "generic",
  NO_CONTEXT_ERROR: "no-context",
}));

import { listCategories } from "@/lib/dal/finance";
import { listImportUnits } from "@/lib/dal/finance-airbnb-import";
import { importFinanceRows } from "@/lib/dal/finance-csv-import";
import { getFinanceContext } from "../_lib/context";
import { financeCsvImportAction } from "./actions";

const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";
const UNIT = "ee204001-0000-4000-8000-000000000001";
const supabase = {};

function form(mode: "preview" | "import", contents: string) {
  const data = new FormData();
  data.set("mode", mode);
  data.set("file", new File([contents], "movimientos.csv", { type: "text/csv" }));
  return data;
}

const csv = [
  "fecha,tipo,categoria,monto,moneda,descripcion,proveedor,metodo,casa",
  "2020-03-05,gasto,Limpieza,80.00,PEN,Limpieza semanal,Rosa,efectivo,Casa Sol",
].join("\n");

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getFinanceContext).mockResolvedValue({ supabase, orgId: ORG, isOwner: true } as never);
  vi.mocked(listImportUnits).mockResolvedValue([{ id: UNIT, name: "Casa Sol" }] as never);
  vi.mocked(listCategories).mockResolvedValue([] as never);
  vi.mocked(importFinanceRows).mockResolvedValue({ ok: true, result: { inserted: 1, duplicates: 0, uncategorized: 0 } } as never);
});

describe("financeCsvImportAction", () => {
  it("rejects a user who is not the owner", async () => {
    vi.mocked(getFinanceContext).mockResolvedValue({ supabase, orgId: ORG, isOwner: false } as never);

    await expect(financeCsvImportAction(null, form("preview", csv))).resolves.toEqual({
      ok: false,
      error: "Solo el dueño puede importar movimientos.",
    });
    expect(importFinanceRows).not.toHaveBeenCalled();
  });

  it("rejects an empty file", async () => {
    await expect(financeCsvImportAction(null, form("preview", ""))).resolves.toEqual({
      ok: false,
      error: "Elige el archivo CSV.",
    });
    expect(importFinanceRows).not.toHaveBeenCalled();
  });

  it("previews parsed rows without writing them", async () => {
    const state = await financeCsvImportAction(null, form("preview", csv));

    expect(state).toMatchObject({ ok: true, mode: "preview", summary: { rows: 1, needsFxRate: false } });
    expect(importFinanceRows).not.toHaveBeenCalled();
  });

  it("imports the rows parsed on the server", async () => {
    const state = await financeCsvImportAction(null, form("import", csv));

    expect(state).toMatchObject({ ok: true, mode: "import", result: { inserted: 1 } });
    expect(importFinanceRows).toHaveBeenCalledWith(supabase, ORG, [expect.objectContaining({
      kind: "expense",
      category: "Limpieza",
      occurred_on: "2020-03-05",
      amount_cents: 8000,
      currency: "PEN",
      unit_id: UNIT,
      payment_method: "cash",
    })], undefined);
  });
});
