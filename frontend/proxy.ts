import { NextResponse, type NextRequest } from "next/server";

const REFRESH_COOKIE = "auto_import_refresh";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/connexion") return NextResponse.next();

  if (!request.cookies.has(REFRESH_COOKIE)) {
    const loginUrl = new URL("/connexion", request.url);
    loginUrl.searchParams.set("retour", path);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
