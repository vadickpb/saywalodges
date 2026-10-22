import { describe, it, expect } from "vitest";
import {
  amenityInputSchema,
  buildPhotoPath,
  checkImageUpload,
  detectImageKind,
  distanceInputSchema,
  moveId,
  spaceInputSchema,
  MAX_UPLOAD_BYTES,
} from "./content-manager";

const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";
const FILE = "0bcf73ac-1c1d-4418-9982-2edde9a3e50c";
const SPACE = "72e893c1-2512-4360-9244-361f1bd50c3f";

const validSpace = {
  key: "pool",
  category: "pool",
  icon: "🏊",
  capacity: "",
  badgeEn: "",
  badgeEs: "",
  labelEn: "Pool",
  labelEs: "Piscina",
  descEn: "",
  descEs: "",
};

describe("spaceInputSchema", () => {
  it("accepts a valid space and turns blank optionals into null", () => {
    const parsed = spaceInputSchema.parse(validSpace);
    expect(parsed.capacity).toBeNull();
    expect(parsed.badgeEn).toBeNull();
  });
  it("rejects a key with uppercase or spaces", () => {
    expect(spaceInputSchema.safeParse({ ...validSpace, key: "Queen A" }).success).toBe(false);
  });
  it("rejects an unknown category", () => {
    expect(spaceInputSchema.safeParse({ ...validSpace, category: "garage" }).success).toBe(false);
  });
  it("requires both labels", () => {
    expect(spaceInputSchema.safeParse({ ...validSpace, labelEs: " " }).success).toBe(false);
  });
});

describe("amenity / distance schemas", () => {
  it("requires titles", () => {
    expect(amenityInputSchema.safeParse({ icon: "", titleEn: "", titleEs: "x", descEn: "", descEs: "" }).success).toBe(false);
  });
  it("allows blank travel time", () => {
    expect(
      distanceInputSchema.safeParse({ placeEn: "A", placeEs: "A", timeEn: "", timeEs: "", icon: "" }).success
    ).toBe(true);
  });
});

describe("moveId", () => {
  const ids = ["a", "b", "c"];
  it("swaps with the neighbour", () => {
    expect(moveId(ids, "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveId(ids, "b", "down")).toEqual(["a", "c", "b"]);
  });
  it("returns null at the edges and for unknown ids", () => {
    expect(moveId(ids, "a", "up")).toBeNull();
    expect(moveId(ids, "c", "down")).toBeNull();
    expect(moveId(ids, "zzz", "up")).toBeNull();
  });
  it("does not mutate its input", () => {
    moveId(ids, "b", "up");
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

describe("detectImageKind / checkImageUpload", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  const webp = Uint8Array.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
  const html = Uint8Array.from(Buffer.from("<script>alert(1)</script>"));

  it("recognises jpeg, png and webp by content", () => {
    expect(detectImageKind(jpeg)?.ext).toBe("jpg");
    expect(detectImageKind(png)?.ext).toBe("png");
    expect(detectImageKind(webp)?.ext).toBe("webp");
  });
  it("rejects html/svg regardless of the declared type", () => {
    expect(detectImageKind(html)).toBeNull();
    expect(checkImageUpload(html).ok).toBe(false);
  });
  it("rejects empty and oversized files", () => {
    expect(checkImageUpload(new Uint8Array()).ok).toBe(false);
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(jpeg);
    expect(checkImageUpload(big).ok).toBe(false);
  });
});

describe("buildPhotoPath", () => {
  it("builds org-prefixed paths per scope", () => {
    expect(buildPhotoPath(ORG, { kind: "site" }, FILE, "jpg")).toBe(`${ORG}/site/${FILE}.jpg`);
    expect(buildPhotoPath(ORG, { kind: "branding" }, FILE, "png")).toBe(`${ORG}/branding/${FILE}.png`);
    expect(buildPhotoPath(ORG, { kind: "space", spaceId: SPACE }, FILE, "webp")).toBe(
      `${ORG}/spaces/${SPACE}/${FILE}.webp`
    );
  });
  it("refuses non-uuid segments (no traversal)", () => {
    expect(() => buildPhotoPath("../x", { kind: "site" }, FILE, "jpg")).toThrow();
    expect(() => buildPhotoPath(ORG, { kind: "space", spaceId: "../../y" }, FILE, "jpg")).toThrow();
    expect(() => buildPhotoPath(ORG, { kind: "site" }, "evil/name", "jpg")).toThrow();
  });
});
