import { env } from "@/lib/env";

export function isVendorImageRequest(request: Request) {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  return env.DEPLOYMENT_MODE === "vendor" && host === env.ROOT_DOMAIN;
}
