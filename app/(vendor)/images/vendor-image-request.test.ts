import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ DEPLOYMENT_MODE: "vendor", ROOT_DOMAIN: "hoststay.example" }) as {
  DEPLOYMENT_MODE: string;
  ROOT_DOMAIN: string;
});
vi.mock("@/lib/env", () => ({ env }));

import { isVendorImageRequest } from "./vendor-image-request";

describe("vendor image request", () => {
  beforeEach(() => {
    env.DEPLOYMENT_MODE = "vendor";
    env.ROOT_DOMAIN = "hoststay.example";
  });

  it("allows the configured vendor root host", () => {
    expect(isVendorImageRequest(new Request("https://hoststay.example/images/hoststay-og"))).toBe(true);
  });

  it("rejects other hosts and non-vendor deployments", () => {
    expect(isVendorImageRequest(new Request("https://demo.hoststay.example/images/hoststay-og"))).toBe(false);
    env.DEPLOYMENT_MODE = "platform";
    expect(isVendorImageRequest(new Request("https://hoststay.example/images/hoststay-og"))).toBe(false);
  });
});
