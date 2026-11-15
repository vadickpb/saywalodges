import type { Metadata } from "next";
import { headers } from "next/headers";
import { PRODUCT_NAME } from "@/config/site";
import { LoginForm } from "@/components/auth/login-form";
import { DemoLoginButton } from "@/components/auth/demo-login-button";
import { env } from "@/lib/env";
import { demoLocaleFromAcceptLanguage } from "@/dictionaries/demo";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default async function LoginPage() {
  const locale = demoLocaleFromAcceptLanguage((await headers()).get("accept-language"));
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-stone/10 bg-white p-8">
        <h1 className="text-2xl font-light text-charcoal mb-1">Sign in</h1>
        <p className="text-sm text-stone mb-6">{PRODUCT_NAME}</p>
        <LoginForm />
        {env.DEMO_MODE === "true" && <DemoLoginButton locale={locale} />}
      </div>
    </div>
  );
}
