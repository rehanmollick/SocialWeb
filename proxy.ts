import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, matches, passcode, tokenFor } from "@/lib/passcode";

export function proxy(request: NextRequest) {
  const code = passcode();
  const { pathname } = request.nextUrl;
  if (!code) {
    // The phone script exposes the server to the network; never do that open.
    if (process.env.SOCIALWEB_EXPOSED === "1" || process.env.VERCEL)
      return new NextResponse("Set APP_PASSCODE before sharing on a network.", {
        status: 503,
      });
    return NextResponse.next();
  }
  if (pathname === "/login" || pathname === "/api/login")
    return NextResponse.next();
  if (matches(request.cookies.get(AUTH_COOKIE)?.value, tokenFor(code)))
    return NextResponse.next();
  if (pathname.startsWith("/api/"))
    return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
