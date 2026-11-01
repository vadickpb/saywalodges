import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.fn();
const log = vi.fn();
vi.mock("@/lib/supabase/anon", () => ({ getSupabaseAnon: () => ({ rpc }) }));
vi.mock("@/lib/log", () => ({ log: (...args: unknown[]) => log(...args) }));
import { bookQuote, getQuoteCheckout } from "./quote-checkout";
const token = "a".repeat(64), publicToken = "b".repeat(64);
const quote = { property_name: "Lodge", unit_name: "Room", check_in: "2030-01-01", check_out: "2030-01-02",
  guests: 2, currency: "USD", total_cents: 50000, deposit_cents: 25000, balance_cents: 25000,
  expires_at: "2030-01-01T00:00:00+00:00", hold_minutes: 120 };
const guest = { token, name: "Ana", email: "ana@example.com", phone: "", terms: "on" as const };
beforeEach(() => vi.clearAllMocks());
describe("checkout DAL", () => {
  it("reads a closed snapshot scoped to host", async () => {
    rpc.mockResolvedValue({ data: quote, error: null });
    expect(await getQuoteCheckout("demo",token)).toEqual(quote);
    expect(rpc).toHaveBeenCalledWith("get_quote_checkout",{p_host:"demo",p_token:token});
  });
  it("rejects malformed tokens and hosts before DB access", async () => {
    for (const [host,t] of [["demo","bad"],["",token],["x".repeat(254),token]]) expect(await getQuoteCheckout(host,t)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("treats nonexistent, expired and cross-tenant results alike; never mutates", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await bookQuote("wrong",guest)).toEqual({error:"invalid"});
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([{...quote,org_id:"secret"},{...quote,balance_cents:0},{...quote,breakdown:{total:1}}])("rejects unsafe or incoherent snapshots", async data => {
    rpc.mockResolvedValue({data,error:null});
    await expect(getQuoteCheckout("demo",token)).rejects.toThrow("Checkout unavailable");
  });
  it("logs only the code on read failure", async () => {
    rpc.mockResolvedValue({data:null,error:{code:"XX000",message:`secret ${token}`}});
    await expect(getQuoteCheckout("demo",token)).rejects.toThrow("Checkout unavailable");
    expect(log).toHaveBeenCalledWith("error","checkout.read.failed",{code:"XX000"});
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
  });
  it("converts using only guest inputs and token, accepting replay", async () => {
    for (const replayed of [false,true]) {
      rpc.mockResolvedValueOnce({data:quote,error:null}).mockResolvedValueOnce({data:{public_token:publicToken,replayed},error:null});
      expect(await bookQuote("demo",guest)).toEqual({publicToken});
      expect(rpc).toHaveBeenLastCalledWith("create_booking_from_quote",{p_token:token,p_guest_name:"Ana",p_guest_email:"ana@example.com",p_guest_phone:undefined});
    }
  });
  it("resumes converted quote without creating anything", async () => {
    rpc.mockResolvedValue({data:{public_token:publicToken},error:null});
    expect(await bookQuote("demo",guest)).toEqual({publicToken});
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([["23P01","unavailable"],["SD001","expired"],["P0002","invalid"],["42501","generic"],["XX000","generic"]])("maps mutation code %s without leaking DB messages",async (code,error) => {
    rpc.mockResolvedValueOnce({data:quote,error:null}).mockResolvedValueOnce({data:null,error:{code,message:`secret ${token}`}});
    expect(await bookQuote("demo",guest)).toEqual({error});
    expect(log).toHaveBeenCalledWith("error","checkout.book.failed",{code});
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
  });
  it("rejects invalid mutation output",async () => {
    rpc.mockResolvedValueOnce({data:quote,error:null}).mockResolvedValueOnce({data:{public_token:"evil"},error:null});
    expect(await bookQuote("demo",guest)).toEqual({error:"generic"});
  });
});
