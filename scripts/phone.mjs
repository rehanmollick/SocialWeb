// Serve the app to your other devices: builds if needed, makes sure a passcode
// exists, prints the addresses to open on your phone, then starts the server.
import { spawn, spawnSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const port = process.env.PORT || "3000";
const next = "node_modules/next/dist/bin/next";

if (!process.env.APP_PASSCODE?.trim()) {
  const code = Array.from({ length: 8 }, () => randomInt(10)).join("");
  appendFileSync(".env.local", `\nAPP_PASSCODE=${code}\n`);
  process.env.APP_PASSCODE = code;
  console.log(`\nCreated a passcode and saved it to .env.local: ${code}`);
}
if (!existsSync(".next/BUILD_ID")) {
  console.log("\nBuilding once…");
  const built = spawnSync("node", [next, "build", "--webpack"], {
    stdio: "inherit",
  });
  if (built.status !== 0) process.exit(built.status ?? 1);
}
const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => `http://${a.address}:${port}`);
console.log(
  `\nOpen on your phone (same Wi-Fi, or anywhere with Tailscale):\n${addresses.map((a) => `  ${a}`).join("\n") || "  no network found"}\nPasscode: the APP_PASSCODE in .env.local\n`,
);
spawn("node", [next, "start", "--hostname", "0.0.0.0", "--port", port], {
  stdio: "inherit",
  env: { ...process.env, SOCIALWEB_EXPOSED: "1" },
}).on("exit", (code) => process.exit(code ?? 0));
