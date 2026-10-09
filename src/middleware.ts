import { NextResponse, type NextRequest } from "next/server";

/**
 * An affiliate landing (?ref=CODE, also what /r/CODE redirects to) is remembered on the server
 * side at once, in an httpOnly cookie: even if the browser never manages to report the click
 * (blocked script, flaky connection, busy server), sign-up, login and checkout recover it.
 * The affiliate's own window is applied when it is used. Nothing else runs here.
 */
export function middleware(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref");
  if (!ref || !/^[A-Za-z0-9_-]{2,32}$/.test(ref)) return NextResponse.next();
  const res = NextResponse.next();
  res.cookies.set("lastro_ref", `${ref.toUpperCase()}.${Date.now()}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 86_400,
  });
  return res;
}

// Pages only: not API routes, Next.js assets or files.
export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
