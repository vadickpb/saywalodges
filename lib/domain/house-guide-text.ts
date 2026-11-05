import { guideSharingCopy } from "@/dictionaries/guide-sharing";
import type { HouseGuide } from "./house-guide";

export const WHATSAPP_MESSAGE_LIMIT = 4096;

/** Export only the supplied published content; sharing credentials are never inputs. */
export function buildGuideTextParts(guide: HouseGuide, lang: string): string[] {
  const copy = guideSharingCopy(lang);
  const text = guide.sections.filter(section => section.visible).map(section => [
    `*${section.title}*`,
    section.text,
    ...section.steps.map((step, index) => `${index + 1}. ${step}`),
    ...section.images.map(image => copy.photoReference(image.caption || image.alt)),
  ].filter(Boolean).join("\n")).join("\n\n");

  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > WHATSAPP_MESSAGE_LIMIT) {
    // Prefer whole lines, then words. Very long lines/words still obey the cap.
    let end = remaining.lastIndexOf("\n", WHATSAPP_MESSAGE_LIMIT);
    if (end <= 0) end = remaining.lastIndexOf(" ", WHATSAPP_MESSAGE_LIMIT);
    if (end <= 0) end = WHATSAPP_MESSAGE_LIMIT;
    // Do not split a UTF-16 surrogate pair (e.g. emoji).
    const last = remaining.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end--;
    parts.push(remaining.slice(0, end));
    remaining = remaining.slice(end).replace(/^\s+/, "");
  }
  if (remaining) parts.push(remaining);
  return parts;
}
