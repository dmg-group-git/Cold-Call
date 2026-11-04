import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/privacy", "/api/cron"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Già loggato e finito sulla pagina di login: torna all'app.
  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/chiamate";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  if (user || isPublic || path.startsWith("/api/")) return response;

  // Supabase non ha risposto (rete lenta, timeout, errore 5xx): NON è un logout.
  // Prima in questi casi si veniva mandati al login senza motivo.
  const supabaseUnreachable =
    !!error && (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500);
  // I "prefetch" di Next.js vengono memorizzati: un redirect al login lì
  // resterebbe in memoria e scatterebbe al click successivo.
  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch";
  const hasSessionCookie = request.cookies.getAll().some((c) => c.name.includes("-auth-token"));

  if (hasSessionCookie && (supabaseUnreachable || isPrefetch)) return response;

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
