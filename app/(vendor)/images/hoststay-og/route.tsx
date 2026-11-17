import OpenGraphImage from "../../opengraph-image";
import { isVendorImageRequest } from "../vendor-image-request";

export function GET(request: Request) {
  if (!isVendorImageRequest(request)) return new Response("Not found", { status: 404 });
  const response = OpenGraphImage();
  response.headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  return response;
}
