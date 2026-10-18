import type { Metadata } from "next";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false },
};

export default function UpdatePasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-stone/10 bg-white p-8">
        <h1 className="text-2xl font-light text-charcoal mb-1">Choose a new password</h1>
        <p className="text-sm text-stone mb-6">At least 8 characters.</p>
        <UpdatePasswordForm />
      </div>
    </div>
  );
}
