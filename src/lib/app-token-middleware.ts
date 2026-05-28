import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getAppToken } from "./app-token";

// Client-side: attach the shared secret header to every server fn call.
// Registered globally in src/start.ts.
export const attachAppToken = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = typeof window !== "undefined" ? getAppToken() : null;
    return next({
      headers: token ? { "x-app-token": token } : {},
    });
  },
);

// Server-side: reject calls that don't present the configured shared secret.
// Applied per-handler in rag.functions.ts.
export const requireAppToken = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const expected = process.env.APP_ACCESS_TOKEN;
    if (!expected) {
      throw new Error("APP_ACCESS_TOKEN is not configured on the server");
    }
    const provided = getRequestHeader("x-app-token");
    if (!provided || provided !== expected) {
      throw new Response("Unauthorized", { status: 401 });
    }
    return next();
  },
);

