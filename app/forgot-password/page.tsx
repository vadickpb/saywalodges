import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-stone/10 bg-white p-8">
        <h1 className="text-2xl font-light text-charcoal mb-1">Reset your password</h1>
        <p className="text-sm text-stone mb-6">We&apos;ll email you a link to choose a new one.</p>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
