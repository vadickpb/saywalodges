import "server-only";
import ExcelJS from "exceljs";
import type { Block, CellValue, Column, ExportModel } from "@/lib/domain/finance-export";

// Turns the workbook model of lib/domain/finance-export.ts into an .xlsx file.
// Dates are real Excel dates, money and counts are real numbers (cents become
// soles with two decimals), and every total is a SUM formula over the rows above
// it (with its value cached, so viewers that do not recalculate still show it).
// User text is always written as a plain string, never as a formula, so a note
// that starts with "=" is shown, not executed.

const FORMATS: Record<Column["kind"], string | undefined> = {
  text: undefined,
  date: "dd/mm/yyyy",
  money: "#,##0.00",
  int: "#,##0",
  percent: "0.0%",
  rate: "0.0000",
};

function toCell(kind: Column["kind"], value: CellValue): ExcelJS.CellValue {
  if (value === null) return null;
  switch (kind) {
    case "date":
      return typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : null;
    case "money":
      return typeof value === "number" ? value / 100 : null;
    case "percent":
      return typeof value === "number" ? value / 10_000 : null;
    default:
      return value;
  }
}

function writeBlock(ws: ExcelJS.Worksheet, block: Block, startRow: number): { header: number; firstData: number; lastData: number; next: number } {
  let row = startRow;
  if (block.title) {
    const title = ws.getRow(row);
    title.getCell(1).value = block.title;
    title.getCell(1).font = { bold: true, size: 12 };
    row += 1;
  }
  const header = row;
  const headerRow = ws.getRow(header);
  block.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin" } };
  });
  const firstData = header + 1;
  block.rows.forEach((values, r) => {
    const out = ws.getRow(firstData + r);
    block.columns.forEach((col, i) => {
      const cell = out.getCell(i + 1);
      cell.value = toCell(col.kind, values[i] ?? null);
      const format = FORMATS[col.kind];
      if (format) cell.numFmt = format;
    });
  });
  const lastData = firstData + block.rows.length - 1;
  let next = lastData + 1;
  if (block.totals) {
    const totals = ws.getRow(next);
    totals.getCell(1).value = "Total";
    totals.getCell(1).font = { bold: true };
    block.columns.forEach((col, i) => {
      if (!col.sum) return;
      const cell = totals.getCell(i + 1);
      const sum = block.rows.reduce((acc, values) => acc + (typeof values[i] === "number" ? values[i] : 0), 0);
      const result = col.kind === "money" ? sum / 100 : sum;
      const letter = ws.getColumn(i + 1).letter;
      cell.value = block.rows.length === 0 ? 0 : { formula: `SUM(${letter}${firstData}:${letter}${lastData})`, result };
      cell.numFmt = FORMATS[col.kind] ?? "General";
      cell.font = { bold: true };
      cell.border = { top: { style: "thin" } };
    });
    next += 1;
  }
  return { header, firstData, lastData, next };
}

export async function renderWorkbook(model: ExportModel): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Saywa Direct";
  for (const sheet of model.sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    // Several blocks share the columns: take the widest each needs.
    const widths: number[] = [];
    for (const block of sheet.blocks) block.columns.forEach((col, i) => (widths[i] = Math.max(widths[i] ?? 0, col.width)));
    widths.forEach((width, i) => (ws.getColumn(i + 1).width = width));
    let row = 1;
    for (const line of sheet.notes) {
      ws.getRow(row).getCell(1).value = line;
      row += 1;
    }
    if (sheet.notes.length > 0) row += 1;
    sheet.blocks.forEach((block, index) => {
      const written = writeBlock(ws, block, row);
      if (index === 0) {
        // Frozen header and filter only where the table starts on row 1.
        if (written.header === 1) ws.views = [{ state: "frozen", ySplit: 1 }];
        if (sheet.filter) {
          ws.autoFilter = {
            from: { row: written.header, column: 1 },
            to: { row: Math.max(written.header, written.lastData), column: block.columns.length },
          };
        }
      }
      row = written.next + 1;
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
