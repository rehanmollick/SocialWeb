import { NextResponse } from "next/server";
import { AUTH_COOKIE, matches, passcode, tokenFor } from "@/lib/passcode";
import { handle, payload, InputError } from "@/lib/http";
export const runtime = "nodejs";

// Slow down guessing: a handful of wrong tries locks sign-in for a few minutes.
const failures: number[] = [];
const WINDOW = 5 * 60_000,
  LIMIT = 8;

export async function POST(req: Request) {
  return handle(async () => {
    const code = passcode();
    if (!code) return { ok: true };
    const now = Date.now();
    while (failures.length && now - failures[0] > WINDOW) failures.shift();
    if (failures.length >= LIMIT)
      throw new InputError("Too many tries. Wait a few minutes.", 429);
    const body = await payload(req);
    const given = typeof body.passcode === "string" ? body.passcode.trim() : "";
    if (!matches(tokenFor(given), tokenFor(code))) {
      failures.push(now);
      throw new InputError("That passcode is not right.", 401);
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, tokenFor(code), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
    return res;
  });
}
