import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

const isPublicPath = (pathname: string) => {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico")
  );
};

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const pathname = req.nextUrl.pathname;
  if (isPublicPath(pathname)) {
    return res;
  }

  const allowedEmail =
    process.env.CHAIRMAN_EMAIL?.toLowerCase().trim() ??
    process.env.NEXT_PUBLIC_CHAIRMAN_EMAIL?.toLowerCase().trim() ??
    "";

  const userEmail = session?.user?.email?.toLowerCase();
  const isAuthorized =
    Boolean(session?.user) && (!allowedEmail || userEmail === allowedEmail);

  if (!isAuthorized) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
