// Fills `{key}` placeholders in a dictionary label. Unknown keys are left
// as-is so a missing value is visible in review instead of silently blank.
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}
