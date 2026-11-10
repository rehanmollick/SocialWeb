import { createHash, timingSafeEqual } from "node:crypto";

// Optional gate for reaching the app from another device. With no
// APP_PASSCODE the app is only ever bound to this computer and stays open.
export const AUTH_COOKIE = "socialweb_auth";
export const passcode = () => process.env.APP_PASSCODE?.trim() || "";

export function tokenFor(code: string) {
  return createHash("sha256").update(`socialweb:${code}`).digest("hex");
}

export function matches(candidate: string | undefined, expected: string) {
  if (!candidate) return false;
  const a = Buffer.from(candidate),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
