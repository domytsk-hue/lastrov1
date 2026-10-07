import { NextResponse } from "next/server";

/** /r/CODE → /?ref=CODE (UTMs kept). The landing then records the click like any ?ref= visit. */
export function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return params.then(({ code }) => {
    const from = new URL(req.url);
    const to = new URL("/", from);
    to.searchParams.set("ref", code.slice(0, 32));
    for (const [k, v] of from.searchParams) if (k.startsWith("utm_")) to.searchParams.set(k, v);
    return NextResponse.redirect(to, 307);
  });
}
