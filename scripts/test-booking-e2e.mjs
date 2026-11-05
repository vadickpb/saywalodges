import { spawnSync } from "node:child_process";
import { bookingAppEnv } from "./booking-e2e-env.mjs";

const env = bookingAppEnv();
for (const args of [["run", "build"], ["exec", "--", "playwright", "test", ...process.argv.slice(2)]]) {
  const result = spawnSync("npm", args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
