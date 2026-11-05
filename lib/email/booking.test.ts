import { describe, it, expect } from "vitest";
import { bookingEvents } from "./content";
import { renderEmail } from "./render";
import { DEFAULT_BRAND } from "./config";

describe("booking email templates", () => {
  for (const lang of ["es", "en"] as const) for (const event of bookingEvents) {
    it(`renders ${event} in ${lang} with the installation brand and escaped input`, () => {
      const result = renderEmail({template:"booking", lang, props:{event,unit:'<script>Casa</script>',
        checkIn:"2026-12-24",checkOut:"2026-12-26",instructions:"Door code: 1234"}}, {...DEFAULT_BRAND,name:"Lodge X"});
      expect(result.subject).toContain("Lodge X");
      expect(result.text).toContain("2026-12-24");
      expect(result.html).not.toContain("<script>");
      expect(result.text).toContain(lang === "es" ? "Llegada" : "Check-in");
      expect(result.text.includes("Door code")).toBe(event === "arrival");
    });
  }
  it("requires actual arrival instructions", () => {
    expect(() => renderEmail({template:"booking",lang:"en",props:{event:"arrival",unit:"Casa",checkIn:"2026-12-24",checkOut:"2026-12-26"}})).toThrow();
  });
});
