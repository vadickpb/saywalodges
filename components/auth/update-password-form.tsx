"use client";

import { useActionState } from "react";
import { updatePassword } from "@/app/update-password/actions";

const inputCls =
  "px-3 py-2 rounded-lg border border-stone/20 bg-white text-sm text-charcoal focus:outline-none focus:border-[#2D4A3E] transition-colors w-full";
const labelCls = "text-xs text-stone uppercase tracking-wide mb-1 block";

export function UpdatePasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="password" className={labelCls}>
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputCls}
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="px-5 py-2.5 bg-[#2D4A3E] text-white text-sm rounded-full hover:bg-[#243D30] transition-colors disabled:opacity-50"
      >
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
