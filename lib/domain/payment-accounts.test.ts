import { describe, expect, it } from "vitest";
import { paymentAccountSchema } from "./payment-accounts";
const mobile = { kind: "yape", holder_name: " Ana ", phone: " 999 888 777 ", currency: "PEN", instructions: " ", active: true, sort_order: "0" };
const bank = { ...mobile, kind: "bank_account", phone: null, bank_name: " BCP ", account_number: "1234", cci: "12345-67890 12345-67890" };
describe("payment account validation", () => {
  it("normalizes every kind and supports parsing normalized values again", () => {
    for (const input of [mobile, { ...mobile, kind: "plin" }, bank]) {
      const value = paymentAccountSchema.parse(input);
      expect(value.holder_name).toBe("Ana");
      expect(value.instructions).toBeNull();
      expect(paymentAccountSchema.parse(value)).toEqual(value);
    }
    expect(paymentAccountSchema.parse(bank).cci).toBe("12345678901234567890");
  });
  it.each([
    { phone: "1234" }, { phone: "1".repeat(31) }, { phone: "abcde" },
    { holder_name: " " }, { holder_name: "a".repeat(201) }, { instructions: "a".repeat(501) },
    { holder_name: "Ana\n" }, { holder_name: "A\u202eB" }, { instructions: "A\u2028B" },
    { instructions: "A\u2029B" }, { instructions: "A\u0000B" }, { bank_name: "BCP" },
    { account_number: "1234" }, { cci: "1".repeat(20) }, { currency: "EUR" },
    { sort_order: "1.5" }, { sort_order: "2147483648" }, { active: "true" },
  ])("rejects malformed mobile fields %j", fields => {
    expect(paymentAccountSchema.safeParse({ ...mobile, ...fields }).success).toBe(false);
  });
  it.each([
    { bank_name: "" }, { bank_name: "a".repeat(101) }, { account_number: "123" },
    { account_number: "a".repeat(41) }, { phone: "999888777" },
    { cci: "1".repeat(19) }, { cci: "1".repeat(21) }, { cci: "x" + "1".repeat(20) },
    { cci: "1".repeat(20) + "\n" }, { bank_name: "B\u200bCP" },
  ])("rejects malformed bank fields %j", fields => {
    expect(paymentAccountSchema.safeParse({ ...bank, ...fields }).success).toBe(false);
  });
  it("allows optional CCI and maximum lengths", () => {
    expect(paymentAccountSchema.safeParse({ ...bank, cci: "", holder_name: "a".repeat(200), bank_name: "a".repeat(100), account_number: "a".repeat(40), instructions: "a".repeat(500) }).success).toBe(true);
  });
});
