"use client";
import { useActionState } from "react";
import { unlockGuideAction } from "./actions";
import { guestGuideCopy } from "@/dictionaries/guest-guide";
export function UnlockForm({host,lang,token}:{host:string;lang:string;token:string}) {
 const dict=guestGuideCopy(lang);const[state,action,pending]=useActionState(unlockGuideAction.bind(null,host,lang,token),{error:''});
 return <form action={action} className="space-y-5"><label className="block font-medium" htmlFor="guide-password">{dict.password}</label><input id="guide-password" name="password" type="password" required minLength={12} maxLength={72} autoComplete="current-password" className="min-h-12 w-full rounded-lg border border-current/30 bg-transparent px-3"/><button disabled={pending} className="min-h-12 w-full rounded-lg bg-site-primary px-4 py-3 font-semibold text-site-primary-fg disabled:opacity-50">{pending?dict.waiting:dict.enter}</button><p role="alert" className="text-sm">{state.error}</p></form>;
}
