"use client";

import { useActionState } from "react";
import { demoSignIn } from "@/app/(platform)/login/actions";
import { demoCopy, type DemoLocale } from "@/dictionaries/demo";

export function DemoLoginButton({ locale }: { locale: DemoLocale }) {
  const [state, formAction, pending] = useActionState(demoSignIn, undefined);
  const copy = demoCopy[locale].login;
  return (
    <div className="mt-6 border-t border-stone/15 pt-5">
      <p className="mb-3 text-center text-xs text-stone">{copy.divider}</p>
      <form action={formAction}>
        <input type="hidden" name="intent" value="demo" />
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full border border-[#2D4A3E] px-5 py-2.5 text-sm font-medium text-[#2D4A3E] transition-colors hover:bg-[#2D4A3E] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D4A3E] focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {pending ? copy.pending : copy.submit}
        </button>
        {state?.error && <p role="alert" className="mt-3 text-sm text-red-600">{copy.error}</p>}
      </form>
    </div>
  );
}
