import { redirect as createExactRedirect } from "../core.js";

/** Creates a JSON response using the platform's canonical serialization. */
export function json<T>(data: T, init?: number | ResponseInit): Response {
  return Response.json(data, typeof init === "number" ? { status: init } : init);
}

/** Creates a redirect response and preserves caller-provided headers. */
export function redirect(location: string, init: number | ResponseInit = 302): Response {
  const response = typeof init === "number"
    ? createExactRedirect(location, init)
    : createExactRedirect(location, init.status ?? 302);
  if (typeof init !== "number") {
    new Headers(init.headers).forEach((value, name) => response.headers.set(name, value));
  }
  return response;
}

/** Creates a redirect that instructs the client to reload the document. */
export function redirectDocument(location: string, init: number | ResponseInit = 302): Response {
  const response = redirect(location, init);
  response.headers.set("X-Remix-Reload-Document", "true");
  return response;
}

/** Creates a redirect that replaces rather than pushes browser history. */
export function replace(location: string, init: number | ResponseInit = 302): Response {
  const response = redirect(location, init);
  response.headers.set("X-Remix-Replace", "true");
  return response;
}

/** Returns whether a value follows the route-error response contract. */
export function isRouteErrorResponse(
  value: unknown
): value is Response | { status: number; statusText: string; data: unknown } {
  return value instanceof Response
    || !!value
      && typeof value === "object"
      && typeof (value as { status?: unknown }).status === "number"
      && "data" in value;
}
