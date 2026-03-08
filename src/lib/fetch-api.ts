/**
 * Thin wrapper around fetch for client-side API calls.
 * Detects when the server redirects to /login (session expired or missing)
 * and forces a client-side navigation instead of silently failing on HTML.
 */
export async function fetchApi(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, { ...init, redirect: "follow" });

  // If the response was redirected to the login page, force navigation
  if (res.redirected && res.url.includes("/login")) {
    window.location.href = "/login";
    // Return a synthetic 401 so callers don't try to parse HTML
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return res;
}
