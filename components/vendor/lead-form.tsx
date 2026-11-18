"use client";

import { useActionState, useState } from "react";
import { submitLead, type LeadState } from "@/app/(vendor)/vendor/actions";

type Copy = {
  name: string; email: string; phone: string; properties: string; package: string; message: string; submit: string;
  sending: string; privacy: string; sent: string; invalid: string; error: string; unavailable: string;
  propertyOptions: readonly { value: string; label: string }[]; packageOptions: readonly { value: string; label: string }[];
};

const field = "mt-2 min-h-12 w-full rounded-xl border border-white/25 bg-white/10 px-4 text-white placeholder:text-white/50 focus:border-[#2DD4BF] focus:outline-none focus:ring-2 focus:ring-[#2DD4BF]/40";

export function LeadForm({ copy }: { copy: Copy }) {
  const [state, action, pending] = useActionState<LeadState, FormData>(submitLead, { status: "idle" });
  const [startedAt] = useState(() => Date.now());
  if (state.status === "sent") return <p className="rounded-2xl bg-[#2DD4BF]/15 p-6 text-lg font-bold" role="status">{copy.sent}</p>;
  const message = state.status === "invalid" ? copy.invalid : state.status === "error" ? copy.error : state.status === "unavailable" ? copy.unavailable : null;
  return (
    <form action={action} className="grid gap-4 text-left">
      <input name="startedAt" type="hidden" value={startedAt} />
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input autoComplete="off" name="website" tabIndex={-1} type="text" /></label></div>
      <label className="text-sm font-bold">{copy.name}<input autoComplete="name" className={field} maxLength={100} minLength={2} name="name" required type="text" /></label>
      <label className="text-sm font-bold">{copy.email}<input autoComplete="email" className={field} maxLength={254} name="email" required type="email" /></label>
      <label className="text-sm font-bold">{copy.phone}<input autoComplete="tel" className={field} maxLength={30} name="phone" pattern="[0-9+()\-\s]*" type="tel" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">{copy.properties}<select className={field} defaultValue="1" name="properties">{copy.propertyOptions.map((o) => <option className="text-[#0C1A22]" key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label className="text-sm font-bold">{copy.package}<select className={field} defaultValue="unsure" name="package">{copy.packageOptions.map((o) => <option className="text-[#0C1A22]" key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      </div>
      <label className="text-sm font-bold">{copy.message}<textarea className={`${field} py-3`} maxLength={1000} name="message" rows={4} /></label>
      {message ? <p className="rounded-xl bg-red-500/20 p-3 text-sm font-bold" role="alert">{message}</p> : null}
      <button className="min-h-12 rounded-xl bg-[#2DD4BF] px-6 font-extrabold text-[#0C1A22] hover:bg-[#5EEAD4] disabled:opacity-60" disabled={pending} type="submit">{pending ? copy.sending : copy.submit}</button>
      <p className="text-xs text-[#B9C9D9]">{copy.privacy}</p>
    </form>
  );
}
