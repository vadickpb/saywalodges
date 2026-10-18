"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/login/actions";

const inputCls =
  "px-3 py-2 rounded-lg border border-stone/20 bg-white text-sm text-charcoal focus:outline-none focus:border-[#2D4A3E] transition-colors w-full";
const labelCls = "text-xs text-stone uppercase tracking-wide mb-1 block";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, undefined);

  if (state?.message) {
    return <p className="text-sm text-charcoal">{state.message}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="email" className={labelCls}>
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={inputCls} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="px-5 py-2.5 bg-[#2D4A3E] text-white text-sm rounded-full hover:bg-[#243D30] transition-colors disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
