import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, send, log } = vi.hoisted(() => ({ rpc:vi.fn(), send:vi.fn(), log:vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({getSupabaseAdmin: () => ({rpc})}));
vi.mock("@/lib/email/send", () => ({sendEmail:send}));
vi.mock("@/lib/log", () => ({log}));
import { deliverBookingEmails } from "./booking-emails";
const source = { EMAIL_MODE:"simulate",NODE_ENV:"test",EMAIL_ARRIVAL_INSTRUCTIONS_ES:"Llegada a las 15:00",EMAIL_ARRIVAL_INSTRUCTIONS_EN:"Arrive at 3pm" };
const claim = { id:"11111111-1111-4111-8111-111111111111",attempt:1,event:"owner_voucher",lang:"en",recipients:["owner@example.com"],unit:"Casa",check_in:"2026-12-24",check_out:"2026-12-26" };
beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({data:null,error:null}); send.mockResolvedValue({ok:true,id:"sim",simulated:true}); });
function queued() {
  rpc.mockResolvedValueOnce({data:claim,error:null}).mockResolvedValueOnce({data:null,error:null});
}
describe("booking email delivery", () => {
  it("claims, sends with a stable event key, settles and does not resend on an empty claim",async () => {
    queued();
    expect(await deliverBookingEmails(undefined,undefined,source)).toEqual({sent:1,failed:0,skipped:0});
    await deliverBookingEmails(undefined,undefined,source);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({lang:"en",idempotencyKey:`booking-email:${claim.id}:0`,props:{event:"owner_voucher"}});
    expect(rpc).toHaveBeenCalledWith("cron_settle_booking_email",{p_id:claim.id,p_attempt:1,p_outcome:"simulated"});
  });
  it("starts every owner delivery concurrently so one timeout cannot consume the whole cron budget", async () => {
    rpc.mockResolvedValueOnce({data:{...claim,recipients:["first@example.com","second@example.com"]},error:null});
    const resolvers: Array<(value: {ok:true,id:string,simulated:boolean}) => void> = [];
    send.mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
    const running = deliverBookingEmails(undefined,undefined,source);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls.map(c => c[0].idempotencyKey)).toEqual([`booking-email:${claim.id}:0`,`booking-email:${claim.id}:1`]);
    for (const resolve of resolvers) resolve({ok:true,id:"sim",simulated:true});
    expect(await running).toMatchObject({sent:1});
  });
  it.each(["result","throw"])("records %s failure without throwing or leaking guest data",async mode => {
    queued();
    if (mode === "throw") send.mockRejectedValue(new Error("secret guest@example.com"));
    else send.mockResolvedValue({ok:false,reason:"unavailable"});
    expect(await deliverBookingEmails(undefined,undefined,source)).toMatchObject({failed:1});
    expect(rpc).toHaveBeenCalledWith("cron_settle_booking_email",{p_id:claim.id,p_attempt:1,p_outcome:"retry"});
    expect(JSON.stringify(log.mock.calls)).not.toContain("example.com");
  });
  it("refuses to consume events when configuration is incomplete",async () => {
    await expect(deliverBookingEmails(undefined,undefined,{EMAIL_ARRIVAL_DAYS:"bad"})).rejects.toThrow("configuration");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("never sends malformed database claims",async () => {
    rpc.mockResolvedValueOnce({data:{...claim,lang:"bad"},error:null});
    expect(await deliverBookingEmails(undefined,undefined,source)).toMatchObject({failed:1});
    expect(send).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("cron_settle_booking_email", {p_id:claim.id,p_outcome:"failed"});
  });
  it("uses the booking language for arrival instructions",async () => {
    rpc.mockResolvedValueOnce({data:{...claim,event:"arrival",lang:"es"},error:null});
    await deliverBookingEmails(undefined,undefined,source);
    expect(send.mock.calls[0][0].props.instructions).toBe(source.EMAIL_ARRIVAL_INSTRUCTIONS_ES);
  });
  it("does not require arrival instructions to deliver other events, and defaults blank days to three", async () => {
    queued();
    expect(await deliverBookingEmails(undefined,undefined,{EMAIL_MODE:"simulate",NODE_ENV:"test",EMAIL_ARRIVAL_DAYS:""})).toMatchObject({sent:1});
    expect(rpc).toHaveBeenCalledWith("cron_claim_booking_email",{p_arrival_days:3});
  });
  it("fails a missing arrival instruction without blocking the next event", async () => {
    rpc.mockResolvedValueOnce({data:{...claim,event:"arrival"},error:null})
      .mockResolvedValueOnce({data:null,error:null})
      .mockResolvedValueOnce({data:claim,error:null});
    expect(await deliverBookingEmails(undefined,undefined,{EMAIL_MODE:"simulate",NODE_ENV:"test"})).toEqual({sent:1,failed:1,skipped:0});
    expect(send).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("cron_settle_booking_email",{p_id:claim.id,p_attempt:1,p_outcome:"failed"});
  });
  it("only requires the arrival instruction in the booking language", async () => {
    rpc.mockResolvedValueOnce({data:{...claim,event:"arrival",lang:"es"},error:null});
    await deliverBookingEmails(undefined,undefined,{EMAIL_MODE:"simulate",NODE_ENV:"test",EMAIL_ARRIVAL_INSTRUCTIONS_ES:"Llegada"});
    expect(send.mock.calls[0][0].props.instructions).toBe("Llegada");
  });
  it("retains provider idempotency keys over all three attempts", async () => {
    for (const attempt of [1,2,3]) {
      rpc.mockResolvedValueOnce({data:{...claim,attempt},error:null})
        .mockResolvedValueOnce({data:null,error:null}).mockResolvedValueOnce({data:null,error:null});
      send.mockResolvedValue({ok:false,reason:"unavailable"});
      await deliverBookingEmails(undefined,undefined,source);
      expect(rpc).toHaveBeenCalledWith("cron_settle_booking_email",{p_id:claim.id,p_attempt:attempt,p_outcome:"retry"});
    }
    expect(new Set(send.mock.calls.map(c => c[0].idempotencyKey)).size).toBe(1);
  });
  it("does not retry permanent provider rejection", async () => {
    queued(); send.mockResolvedValue({ok:false,reason:"rejected"});
    await deliverBookingEmails(undefined,undefined,source);
    expect(rpc).toHaveBeenCalledWith("cron_settle_booking_email",{p_id:claim.id,p_attempt:1,p_outcome:"failed"});
  });
  it("ignores invalid claim ids rather than attempting settlement", async () => {
    rpc.mockResolvedValueOnce({data:{...claim,id:"bad"},error:null});
    await deliverBookingEmails(undefined,undefined,source);
    expect(rpc.mock.calls.some(c => c[0] === "cron_settle_booking_email")).toBe(false);
  });
  it("reports settlement failure without releasing the durable claim",async () => {
    rpc.mockResolvedValueOnce({data:claim,error:null}).mockResolvedValueOnce({data:null,error:{code:"XX000"}});
    await expect(deliverBookingEmails(undefined,undefined,source)).rejects.toThrow("settle");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
