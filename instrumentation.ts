import type { Instrumentation } from "next";
import { errorName, log } from "@/lib/log";

// Unhandled server errors (SD-606). `err.message`, `request.path` (it can hold a calendar or
// booking token) and headers are deliberately ignored: only the route *pattern*, the router
// context and Next's opaque digest are logged. Route handlers that catch their own errors
// (cron) log through lib/log directly.
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  const digest = typeof err === "object" && err !== null && "digest" in err ? err.digest : undefined;
  log("error", "request.unhandled_error", {
    route: context.routePath,
    routeType: context.routeType,
    method: request.method,
    errorName: errorName(err),
    digest: typeof digest === "string" ? digest : undefined,
  });
};
