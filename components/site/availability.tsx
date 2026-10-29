import Link from "next/link";
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import type { Dict } from "@/dictionaries/en";
import { format } from "@/lib/domain/format";
import { dayOfWeek, parseIsoMonth, type IsoMonth } from "@/lib/domain/dates";
import type { CalendarCell, CalendarWeek, DayStatus, MonthNavigation } from "@/lib/domain/public-availability";
import { Container, SectionHeading, buttonStyles } from "./ui";

type Unit = { id: string; name: string };

type Props = {
  dict: Dict["availability"];
  waUrl: string;
  waLabel: string;
  units: Unit[];
  unitId: string;
  nav: MonthNavigation;
  // null when the calendar could not be loaded: say so, never show it as all free.
  weeks: CalendarWeek[] | null;
};

const ANCHOR = "availability-calendar";

// Occupied and past are told apart from free by shape (strike-through, hatching),
// not only by colour, and every cell has a text alternative for screen readers.
const CELL_STYLES: Record<DayStatus, string> = {
  free: "border border-site-line bg-site-bg text-site-fg",
  occupied: "bg-site-line/70 text-site-muted line-through decoration-2 [background-image:repeating-linear-gradient(135deg,transparent_0_5px,color-mix(in_srgb,currentColor_18%,transparent)_5px_6px)]",
  past: "text-site-muted/50",
};

function href(unitId: string, month: IsoMonth) {
  return `?unit=${encodeURIComponent(unitId)}&month=${month}#${ANCHOR}`;
}

function Day({ cell, month, year, dict }: { cell: CalendarCell; month: string; year: number; dict: Props["dict"] }) {
  const { weekdays } = dict;
  // dayOfWeek is 0 = Sunday; the grid and the dictionary start on Monday.
  const weekday = weekdays[(dayOfWeek(cell.date) + 6) % 7] ?? "";
  const status = dict[cell.status] + (cell.today ? `, ${dict.today}` : "");
  return (
    <td className="p-0.5 text-center">
      <span
        className={`flex aspect-square min-h-10 items-center justify-center rounded-site text-sm tabular-nums ${CELL_STYLES[cell.status]} ${cell.today ? "ring-2 ring-site-accent ring-offset-1" : ""}`}
      >
        <span className="sr-only">{format(dict.dayLabel, { weekday, day: cell.day, month, year, status })}</span>
        <span aria-hidden="true">{cell.day}</span>
      </span>
    </td>
  );
}

function MonthLink({ to, label, children }: { to: string | null; label: string; children: React.ReactNode }) {
  const base = "inline-flex size-11 items-center justify-center rounded-site border border-site-line transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent";
  if (!to) {
    return (
      <span aria-disabled="true" className={`${base} cursor-not-allowed opacity-30`}>
        <span className="sr-only">{label}</span>
        {children}
      </span>
    );
  }
  return (
    <Link href={to} aria-label={label} className={`${base} hover:bg-site-bg`}>
      {children}
    </Link>
  );
}

// Free / occupied nights per unit. Server-rendered and navigated with plain links
// (?unit=…&month=…), so it works without JavaScript and the page never receives
// anything but dates already reduced to a status.
export function Availability({ dict, waUrl, waLabel, units, unitId, nav, weeks }: Props) {
  const { year, month } = parseIsoMonth(nav.month);
  const monthName = dict.months[month - 1] ?? "";
  const title = format(dict.monthLabel, { month: monthName, year });
  const captionId = `${ANCHOR}-caption`;

  return (
    <section id={ANCHOR} className="scroll-mt-20 py-20 sm:py-28">
      <Container>
        <SectionHeading label={dict.label} title={dict.title} />
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-site-muted">{dict.intro}</p>

        {units.length > 1 && (
          <nav aria-label={dict.unitPicker} className="mt-8">
            <ul className="flex flex-wrap gap-2">
              {units.map((unit) => (
                <li key={unit.id}>
                  <Link
                    href={href(unit.id, nav.month)}
                    aria-current={unit.id === unitId ? "true" : undefined}
                    className={`inline-flex min-h-11 items-center rounded-site border px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent ${
                      unit.id === unitId ? "border-site-primary bg-site-primary text-site-primary-fg" : "border-site-line hover:bg-site-surface"
                    }`}
                  >
                    {unit.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="mt-8 max-w-md">
          {weeks ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <MonthLink to={nav.prev && href(unitId, nav.prev)} label={dict.previousMonth}>
                  <ChevronLeft className="size-5" aria-hidden="true" />
                </MonthLink>
                <h3 id={captionId} className="font-site-heading text-xl capitalize tracking-tight">
                  {title}
                </h3>
                <MonthLink to={nav.next && href(unitId, nav.next)} label={dict.nextMonth}>
                  <ChevronRight className="size-5" aria-hidden="true" />
                </MonthLink>
              </div>

              <table className="mt-4 w-full table-fixed border-collapse" aria-labelledby={captionId}>
                <thead>
                  <tr>
                    {dict.weekdays.map((weekday, i) => (
                      <th key={weekday} scope="col" className="pb-2 text-center text-xs font-semibold uppercase text-site-muted">
                        <abbr title={weekday} className="no-underline">
                          {dict.weekdaysShort[i]}
                        </abbr>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week, w) => (
                    <tr key={w}>
                      {week.map((cell, i) =>
                        cell ? <Day key={cell.date} cell={cell} month={monthName} year={year} dict={dict} /> : <td key={`pad-${i}`} aria-hidden="true" />,
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-site-muted">
                <li className="flex items-center gap-2">
                  <span aria-hidden="true" className={`size-5 rounded-site ${CELL_STYLES.free}`} />
                  {dict.legendFree}
                </li>
                <li className="flex items-center gap-2">
                  <span aria-hidden="true" className={`size-5 rounded-site ${CELL_STYLES.occupied}`} />
                  {dict.legendOccupied}
                </li>
              </ul>
              <p className="mt-3 text-xs text-site-muted">{dict.checkoutNote}</p>
            </>
          ) : (
            <p role="status" className="rounded-site border border-site-line bg-site-surface p-5 text-sm leading-relaxed">
              {dict.unavailable}
            </p>
          )}
        </div>

        <a href={waUrl} target="_blank" rel="noopener noreferrer" className={`${buttonStyles.primary} mt-8`}>
          <MessageCircle className="size-4" aria-hidden="true" />
          {waLabel}
        </a>
      </Container>
    </section>
  );
}
