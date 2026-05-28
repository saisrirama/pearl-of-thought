// All RAG server functions: ingest, chat (retrieval + grounded generation), summarize, list, delete.
// Scoped per-authenticated-user.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const EMBED_MODEL = "openai/text-embedding-3-small";
const CHAT_MODEL = "google/gemini-3-flash-preview";

function apiKey() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("AI key is not configured");
  return k;
}

async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Embedding failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.data.map((d: { embedding: number[] }) => d.embedding);
}

async function chat(messages: Array<{ role: string; content: string }>): Promise<string> {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: CHAT_MODEL, messages }),
  });
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 429) throw new Error("Rate limited — please wait a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    throw new Error(`AI request failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

const IngestSchema = z.object({
  filename: z.string().min(1).max(300),
  storagePath: z.string().optional(),
  pageCount: z.number().int().min(0),
  chunks: z
    .array(
      z.object({
        index: z.number().int().min(0),
        page: z.number().int().min(1),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(2000),
});

export const ingestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => IngestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { data: doc, error: docErr } = await supabaseAdmin
      .from("documents")
      .insert({
        user_id: userId,
        filename: data.filename,
        storage_path: data.storagePath ?? null,
        page_count: data.pageCount,
        status: "processing",
      })
      .select()
      .single();
    if (docErr || !doc) throw new Error(docErr?.message ?? "Failed to create document");

    try {
      const BATCH = 64;
      for (let i = 0; i < data.chunks.length; i += BATCH) {
        const batch = data.chunks.slice(i, i + BATCH);
        const vectors = await embed(batch.map((c) => c.content));
        const rows = batch.map((c, j) => ({
          document_id: doc.id,
          chunk_index: c.index,
          page: c.page,
          content: c.content,
          embedding: vectors[j] as unknown as string,
        }));
        const { error: insErr } = await supabaseAdmin.from("chunks").insert(rows);
        if (insErr) throw new Error(insErr.message);
      }

      const head = data.chunks.slice(0, 8).map((c) => c.content).join("\n\n");
      const summaryRaw = await chat([
        {
          role: "system",
          content:
            "You are a precise research assistant. Given an excerpt from a document, produce a concise summary in this exact JSON shape (no prose around it): {\"summary\": string (2-3 sentences), \"keyPoints\": string[] (3-5 short bullets)}. Use only what's in the excerpt.",
        },
        { role: "user", content: `Document: ${data.filename}\n\nExcerpt:\n${head.slice(0, 6000)}` },
      ]);
      let summary = "";
      let keyPoints: string[] = [];
      try {
        const match = summaryRaw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(match ? match[0] : summaryRaw);
        summary = String(parsed.summary ?? "").trim();
        keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 5).map(String) : [];
      } catch {
        summary = summaryRaw.slice(0, 400);
      }

      await supabaseAdmin
        .from("documents")
        .update({ status: "ready", summary, key_points: keyPoints })
        .eq("id", doc.id);

      return { id: doc.id, status: "ready" as const, summary, keyPoints };
    } catch (e) {
      await supabaseAdmin.from("documents").update({ status: "error" }).eq("id", doc.id);
      throw e;
    }
  });

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("id, filename, status, summary, key_points, page_count, position, created_at")
      .eq("user_id", context.userId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("documents")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ids: z.array(z.string().uuid()).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    await Promise.all(
      data.ids.map((id, idx) =>
        supabaseAdmin
          .from("documents")
          .update({ position: idx })
          .eq("id", id)
          .eq("user_id", context.userId),
      ),
    );
    return { ok: true };
  });

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("id, role, content, citations, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const clearConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ChatSchema = z.object({
  message: z.string().min(1).max(4000),
  documentIds: z.array(z.string().uuid()).optional(),
});

export interface Citation {
  n: number;
  chunkId: string;
  documentId: string;
  filename: string;
  page: number;
  snippet: string;
  similarity: number;
}

export const askQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ChatSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    await supabaseAdmin.from("messages").insert({ user_id: userId, role: "user", content: data.message });

    const { data: history } = await supabaseAdmin
      .from("messages")
      .select("role, content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    const conversation = (history ?? []).reverse();

    // Restrict retrieval to this user's documents
    const { data: userDocs } = await supabaseAdmin
      .from("documents")
      .select("id")
      .eq("user_id", userId);
    const userDocIds = (userDocs ?? []).map((d) => d.id);
    if (userDocIds.length === 0) {
      const reply = "Upload a document first, then ask a question about it.";
      const { data: stored } = await supabaseAdmin
        .from("messages")
        .insert({ user_id: userId, role: "assistant", content: reply, citations: [] })
        .select()
        .single();
      return { message: stored, citations: [] as Citation[] };
    }

    const filterIds =
      data.documentIds && data.documentIds.length > 0
        ? data.documentIds.filter((id) => userDocIds.includes(id))
        : userDocIds;

    const [queryVec] = await embed([data.message]);
    const { data: matches, error: matchErr } = await supabaseAdmin.rpc("match_chunks", {
      query_embedding: queryVec as unknown as string,
      match_count: 6,
      doc_ids: filterIds as string[],
    });
    if (matchErr) throw new Error(matchErr.message);

    const retrieved = (matches ?? []) as Array<{
      id: string;
      document_id: string;
      page: number;
      content: string;
      similarity: number;
      filename: string;
    }>;

    if (retrieved.length === 0) {
      const reply =
        "I couldn't find anything in your uploaded documents that addresses that. Try rephrasing, or upload a source that covers this topic.";
      const { data: stored } = await supabaseAdmin
        .from("messages")
        .insert({ user_id: userId, role: "assistant", content: reply, citations: [] })
        .select()
        .single();
      return { message: stored, citations: [] as Citation[] };
    }

    const citations: Citation[] = retrieved.map((r, i) => ({
      n: i + 1,
      chunkId: r.id,
      documentId: r.document_id,
      filename: r.filename,
      page: r.page,
      snippet: r.content,
      similarity: r.similarity,
    }));

    const context_str = citations
      .map((c) => `[${c.n}] (${c.filename}, p.${c.page})\n${c.snippet}`)
      .join("\n\n");

    const system = `You are KnowledgeHub, a careful research assistant. Answer ONLY using the provided context. Cite every claim with bracketed numbers like [1] or [2][3] that map to the context blocks. If the context doesn't answer the question, say so plainly — do not invent facts. Keep answers structured (short paragraphs, bullets when useful) and editorial in tone.`;

    const messages = [
      { role: "system", content: system },
      ...conversation.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: `Context:\n${context_str}\n\nQuestion: ${data.message}` },
    ];

    const answer = await chat(messages);

    const used = new Set<number>();
    for (const m of answer.matchAll(/\[(\d+)\]/g)) used.add(parseInt(m[1], 10));
    const finalCitations = citations.filter((c) => used.has(c.n));
    const finalList = finalCitations.length > 0 ? finalCitations : citations.slice(0, 3);

    const { data: stored } = await supabaseAdmin
      .from("messages")
      .insert({
        user_id: userId,
        role: "assistant",
        content: answer,
        citations: finalList as unknown as never,
      })
      .select()
      .single();

    return { message: stored, citations: finalList };
  });

// ---------- ACCOUNT ----------

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("username, first_name, last_name")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data;
  });
