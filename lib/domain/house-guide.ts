import { z } from "zod";

// Private content has a separate schema: never put this in properties.content,
// which is deliberately readable by anonymous visitors.
export const guideImageSchema = z.preprocess((input) => {
  // The persisted format requires alt text; derive it when only a name was entered.
  if (typeof input === "object" && input !== null && "alt" in input &&
      typeof input.alt === "string" && !input.alt.trim() &&
      "caption" in input && typeof input.caption === "string") {
    return { ...input, alt: input.caption.trim().slice(0, 240) };
  }
  return input;
}, z.object({
  id: z.uuid(),
  alt: z.string().trim().min(1).max(240),
  caption: z.string().trim().max(500).default(""),
}).strict());

export const guideSectionSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(160),
  text: z.string().trim().max(12000),
  steps: z.array(z.string().trim().min(1).max(1200)).max(30),
  images: z.array(guideImageSchema).max(12),
  visible: z.boolean(),
}).strict();

export const houseGuideSchema = z.object({
  title: z.string().trim().min(1).max(160),
  sections: z.array(guideSectionSchema).max(30),
}).strict().superRefine((guide, ctx) => {
  const ids = new Set<string>();
  guide.sections.forEach((section, index) => {
    if (ids.has(section.id)) ctx.addIssue({ code: "custom", path: ["sections", index, "id"], message: "duplicate" });
    ids.add(section.id);
  });
});

export type HouseGuide = z.infer<typeof houseGuideSchema>;

// A revocation is authoritative even for an otherwise unexpired visitor session.
export function isGuideLinkActive(link: { expiresAt: string; revokedAt: string | null }, now: number): boolean {
  const expiry = Date.parse(link.expiresAt);
  return link.revokedAt === null && Number.isFinite(now) && Number.isFinite(expiry) && expiry > now;
}

export const guidePasswordSchema = z.string().min(6).max(72).refine(value => new TextEncoder().encode(value).length <= 72, "Máximo 72 bytes");
export const guideTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
