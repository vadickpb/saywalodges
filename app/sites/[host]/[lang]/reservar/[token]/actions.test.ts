import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const book = vi.fn();
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
vi.mock("next/headers", () => ({ headers: async () => new Headers({host:"demo.localhost:3000"}) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("@/lib/dal/public/quote-checkout", () => ({ bookQuote: (...args:unknown[]) => book(...args) }));
vi.mock("@/lib/dal/public/site", () => ({ siteIdentifierFromHost: (host:string) => host.replace(".localhost:3000","") }));
import { submitCheckout } from "./actions";
const token="a".repeat(64), publicToken="b".repeat(64);
function form(patch: Record<string,string | undefined>={}) {
  const result = new FormData();
  for (const [k,v] of Object.entries({token,name:"Ana",email:"ANA@example.com",phone:"",terms:"on",...patch})) if (v !== undefined) result.set(k,v);
  return result;
}
beforeEach(() => vi.clearAllMocks());
describe("public checkout action", () => {
  it("ignores forged monetary, date, tenant and host inputs",async () => {
    book.mockResolvedValue({publicToken});
    await expect(submitCheckout("es",{},form({total_cents:"1",deposit_cents:"0",currency:"PEN",host:"saywa-lodges",org_id:"other",check_in:"2030-01-01"})))
      .rejects.toThrow(`REDIRECT:/es/reserva/${publicToken}`);
    expect(book).toHaveBeenCalledWith("demo",{token,name:"Ana",email:"ana@example.com",phone:"",terms:"on"});
  });
  it.each([{name:" "},{name:"Ana\n"},{name:"Ana\u202e"},{email:"bad"},{email:""},{phone:"script"},{terms:"false"}])("validates before calling DAL %o",async patch => {
    const state=await submitCheckout("es",{},form(patch));
    expect(state.error).toBe("validation");
    expect(state.fields).toHaveProperty(Object.keys(patch)[0],true);
    expect(book).not.toHaveBeenCalled();
  });
  it("treats a malformed token as an unavailable link rather than a field error", async () => {
    expect(await submitCheckout("es", {}, form({token:"bad", email:""}))).toEqual({error:"linkUnavailable"});
    expect(book).not.toHaveBeenCalled();
  });
  it("requires terms acceptance and never trusts previous state",async () => {
    const data=form(); data.delete("terms");
    expect(await submitCheckout("en",{fields:{terms:false}},data)).toEqual({error:"validation",fields:{terms:true}});
    expect(book).not.toHaveBeenCalled();
  });
  it("rejects a forged redirect language",async () => {
    expect(await submitCheckout("//evil.test",{},form())).toEqual({error:"generic"});
    expect(book).not.toHaveBeenCalled();
  });
  it("redirects each successful DAL result to its returned status capability",async () => {
    book.mockResolvedValue({publicToken});
    for(let i=0;i<2;i++) await expect(submitCheckout("en",{},form())).rejects.toThrow(`REDIRECT:/en/reserva/${publicToken}`);
    expect(redirect.mock.calls).toEqual([[`/en/reserva/${publicToken}`],[`/en/reserva/${publicToken}`]]);
  });
  it.each(["linkUnavailable","unbookable","unavailable","generic"])("returns expected %s error",async error => {
    book.mockResolvedValue({error});
    expect(await submitCheckout("es",{},form())).toEqual({error});
    expect(redirect).not.toHaveBeenCalled();
  });
  it("never leaks thrown database messages",async () => {
    book.mockRejectedValue(new Error(`guest secret ${token}`));
    expect(await submitCheckout("es",{},form())).toEqual({error:"generic"});
  });
});
