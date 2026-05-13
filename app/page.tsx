import { redirect } from "next/navigation";

// The proxy.ts handles the redirect with browser language detection.
// This is a fallback in case the proxy doesn't run (e.g. static export).
export default function RootPage() {
  redirect("/en");
}
