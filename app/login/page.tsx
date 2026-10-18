import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-stone/10 bg-white p-8">
        <h1 className="text-2xl font-light text-charcoal mb-1">Sign in</h1>
        <p className="text-sm text-stone mb-6">Saywa Direct</p>
        <LoginForm />
      </div>
    </div>
  );
}
