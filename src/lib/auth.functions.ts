// Verifies a candidate password against APP_ACCESS_TOKEN.
// Uses the same shared-secret check as every other server fn (via requireAppToken),
// but accepts the token from the request body so the user can submit it from the
// unlock screen before it's persisted in localStorage.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const verifyAppToken = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: z.string().min(1).max(500) }).parse(input))
  .handler(async ({ data }) => {
    const expected = process.env.APP_ACCESS_TOKEN;
    if (!expected) throw new Error("APP_ACCESS_TOKEN is not configured");
    // Constant-time-ish compare
    if (data.token.length !== expected.length) return { ok: false as const };
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= data.token.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return { ok: diff === 0 };
  });
