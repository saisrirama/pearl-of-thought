# Architecture — KnowledgeHub AI

A premium AI research notebook with a real Retrieval-Augmented Generation pipeline.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | TanStack Start (React 19) + TailwindCSS v4 + shadcn/ui |
| Backend | TanStack `createServerFn` (type-safe RPCs running on the edge) |
| Database | Postgres (Lovable Cloud) |
| Vector store | `pgvector` (HNSW + cosine) — `chunks.embedding vector(1536)` |
| File storage | Lovable Cloud Storage bucket `pdfs` |
| Embeddings | `openai/text-embedding-3-small` via Lovable AI Gateway (1536-d) |
| Chat / summarization | `google/gemini-3-flash-preview` via Lovable AI Gateway |
| PDF parsing | `pdfjs-dist` in the browser (preserves page boundaries) |

> Note: the original spec called for Next.js + FastAPI + ChromaDB + Docker. Lovable runs on TanStack Start + Lovable Cloud, so the equivalent stack above is used. The product behavior, RAG semantics, and design are identical.

## RAG pipeline

```
┌─────────────────┐   ┌──────────────────┐   ┌────────────────────┐
│ Browser parses  │──▶│ Chunk (~800 ch.  │──▶│ Server fn:         │
│ PDF → pages     │   │ 100 overlap,     │   │  - embed (batch 64)│
│ (pdfjs)         │   │ sentence-aware)  │   │  - insert chunks   │
└─────────────────┘   └──────────────────┘   │  - generate summary│
                                              └─────────┬──────────┘
                                                        ▼
                                              ┌──────────────────┐
                                              │  pgvector HNSW   │
                                              └─────────┬────────┘
                                                        ▼
  question ─▶ embed(query) ─▶ match_chunks(top-k=6) ─▶ grounded prompt ─▶ answer + [n] citations
```

### Chunking
`src/lib/pdf-client.ts` — `chunkPages(pages, size=800, overlap=100)`. Splits on the last sentence boundary that lands past the 50% mark for cleaner semantic units. Page numbers are preserved on each chunk so citations always know what page to point at.

### Embedding
`src/lib/rag.functions.ts → embed()` calls `POST /v1/embeddings` with `openai/text-embedding-3-small`. Vectors are 1536-d to match the column. Batches of 64 inputs per call.

### Retrieval
SQL function `public.match_chunks(query_embedding, match_count, doc_ids)` runs cosine search using the HNSW index, optionally filtered to selected documents. Returns the chunk text, page, filename, and similarity score.

### Generation (grounded)
The model receives:
- A strict system prompt: *answer only from context, cite with bracketed numbers, admit uncertainty*.
- Conversation history (last 10 messages) for follow-up questions.
- The retrieved chunks formatted as numbered blocks: `[n] (filename, p.X)\n<snippet>`.

The assistant's reply is scanned for `[n]` markers — only citations actually used in the answer are surfaced in the UI. This keeps the citation rail tight and meaningful.

### Summaries
On ingest, the first ~8 chunks are sent to the chat model with a JSON-only response contract (`{ summary, keyPoints }`). The summary card appears in the center workspace and is capped to keep the UI lightweight.

## Database

| Table | Purpose |
| --- | --- |
| `documents` | One row per uploaded PDF. Holds `filename`, `status` (`processing` / `ready` / `error`), `summary`, `key_points`, `position` (drag-to-reorder), `page_count`. |
| `chunks` | Semantic chunks with `page`, `content`, `embedding vector(1536)`. HNSW index for cosine search. Cascades on document delete. |
| `messages` | Conversation memory: `role`, `content`, `citations jsonb`. |

`match_chunks(query_embedding, match_count, doc_ids)` is a stable SQL function that does the vector search.

## Server functions (REST equivalents)

| Server fn | Equivalent REST | Behaviour |
| --- | --- | --- |
| `ingestDocument` | `POST /upload` | Persist doc, embed all chunks, store, generate summary, mark ready. |
| `askQuestion` | `POST /chat` | Embed query → vector search → grounded prompt → answer + citations + persist. |
| `listDocuments` | `GET /documents` | List sources in display order. |
| `deleteDocument` | `DELETE /documents/:id` | Cascades to chunks. |
| `reorderDocuments` | `PATCH /documents/order` | Drag-and-drop persistence. |
| `listMessages` / `clearConversation` | conversation history utilities |

All server functions live in `src/lib/rag.functions.ts`. They run on the edge (Cloudflare Worker) and use the service-role Supabase client for trusted writes.

## Frontend

Three resizable panels (see `src/routes/index.tsx`):

- **Left — Sources** (`SourcesPanel`): drag-and-drop upload, document cards with indexing state, filter, reorder, delete.
- **Center — Notebook** (`NotebookPanel`): summary cards for ready documents + conversational QA with structured markdown answers.
- **Right — Citations** (`CitationsPanel`): numbered pills extracted from the latest assistant message; clicking a pill opens a floating card with the highlighted snippet, filename, page number, and relevance.

## Observability

Server functions log structured errors via `console.error`. Use the `server-function-logs` tool (or your hosting dashboard) to tail published / preview logs filtered by keyword.

## Why no Docker

Lovable Cloud handles deployment, scaling, and TLS automatically — there is no container surface to define. Locally, `bun dev` runs the full stack (frontend + server functions) in one process against the cloud Postgres/Storage instance.

## Engineering decisions

- **Browser PDF parsing** keeps the edge runtime small and avoids native PDF binaries that don't run in Workers. Page boundaries are preserved for grounded citations.
- **pgvector + HNSW** instead of a separate vector DB — one fewer service, transactional consistency with document rows, free cascade-delete.
- **Single-user demo** — RLS policies are intentionally open. To make this multi-tenant, add Lovable Cloud auth, a `user_id uuid references auth.users` column on `documents` and `messages`, scope `match_chunks` by user, and replace the open policies with `auth.uid() = user_id` policies.
- **Citation filtering** — only `[n]` markers actually present in the answer are shown, so the rail never has stale references.
- **Conversation memory** — last 10 messages are replayed into every prompt so follow-up questions ("what about page 3?") work naturally.
