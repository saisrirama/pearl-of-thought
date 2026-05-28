# Technical Specification: KnowledgeHub AI

## System Summary

KnowledgeHub AI is a TanStack Start application that combines a React document workspace with server functions for Retrieval-Augmented Generation. PDF text is extracted in the browser, chunked client-side, sent to protected server functions, embedded through Lovable AI Gateway, stored in Supabase Postgres with pgvector, and retrieved for grounded AI answers.

## Runtime and Tooling

- Runtime target: Node.js 22.x
- App framework: TanStack Start with React 19
- Router: TanStack Router
- Data fetching: TanStack Query
- Styling: Tailwind CSS v4 with shadcn/ui-compatible primitives
- Server functions: `createServerFn` from `@tanstack/react-start`
- Database/client SDK: Supabase JavaScript client
- Vector search: Supabase Postgres with pgvector
- AI gateway: Lovable AI Gateway
- PDF parsing: `pdfjs-dist`
- Deployment target: Vercel through Nitro Vercel preset

## Important Source Files

| Area | File |
| --- | --- |
| Main notebook route and UI | `src/routes/index.tsx` |
| Root route, metadata, shell, errors | `src/routes/__root.tsx` |
| Router setup | `src/router.tsx` |
| TanStack Start middleware setup | `src/start.ts` |
| RAG server functions | `src/lib/rag.functions.ts` |
| Browser PDF extraction and chunking | `src/lib/pdf-client.ts` |
| Shared-token middleware | `src/lib/app-token-middleware.ts` |
| Access-token verification | `src/lib/auth.functions.ts` |
| Browser token storage | `src/lib/app-token.ts` |
| Server Supabase client | `src/integrations/supabase/client.server.ts` |
| Supabase generated types | `src/integrations/supabase/types.ts` |
| Database migrations | `supabase/migrations/*.sql` |
| Vite/Nitro/Vercel configuration | `vite.config.ts` |
| Deployment notes | `DEPLOYMENT.md` |

## Architecture

```text
Browser
  |
  | PDF file
  v
pdfjs-dist extracts page text
  |
  v
chunkPages creates page-aware chunks
  |
  v
TanStack server function: ingestDocument
  |
  | create document, embed chunks, insert rows, summarize
  v
Supabase Postgres + pgvector
  |
  | match_chunks(query_embedding, match_count, doc_ids)
  v
TanStack server function: askQuestion
  |
  | grounded prompt with retrieved context
  v
Lovable AI Gateway chat completion
  |
  v
Persisted assistant message + citation JSON
```

## Frontend Design

The main route in `src/routes/index.tsx` renders a full-height three-column notebook:

- `SourcesPanel`: uploads PDFs, filters sources, shows processing state, deletes documents, and persists drag reorder operations.
- `NotebookPanel`: shows generated document summaries, renders conversation messages, and submits questions.
- `CitationsPanel`: lists citations from the latest assistant response and shows snippet details.

The root route in `src/routes/__root.tsx` provides document metadata, global stylesheets, root shell markup, error UI, 404 UI, TanStack Query provider, and toast rendering.

## Access Control

The app uses a shared-token gate rather than full user authentication.

Client flow:

1. `AppGate` prompts for the access password.
2. `verifyAppToken` compares the submitted token with `APP_ACCESS_TOKEN`.
3. On success, `setAppToken` stores the token in `localStorage`.
4. `attachAppToken` adds the token to server function requests as `x-app-token`.

Server flow:

1. Protected server functions include `.middleware([requireAppToken])`.
2. `requireAppToken` reads `APP_ACCESS_TOKEN` from `process.env`.
3. The middleware compares it against the `x-app-token` request header.
4. Missing or mismatched tokens receive an unauthorized response.

## Server Functions

All RAG server functions live in `src/lib/rag.functions.ts`.

| Function | Method | Purpose |
| --- | --- | --- |
| `ingestDocument` | POST | Create document, embed chunks, insert chunk rows, generate summary, mark document ready or error. |
| `listDocuments` | GET | Return documents ordered by `position` and `created_at`. |
| `deleteDocument` | POST | Delete a document by UUID. Related chunks cascade in the database. |
| `reorderDocuments` | POST | Update document positions from an ordered UUID list. |
| `listMessages` | GET | Return up to 200 messages ordered by creation time. |
| `clearConversation` | POST | Delete all persisted messages. |
| `askQuestion` | POST | Persist user message, retrieve matching chunks, generate grounded answer, persist assistant message and citations. |

Input validation uses Zod schemas directly inside server functions.

## PDF Extraction and Chunking

`src/lib/pdf-client.ts` is browser-only by design. It lazy-imports `pdfjs-dist` inside `extractPdfPages` so server-side rendering does not evaluate browser-only PDF APIs.

Extraction behavior:

- Loads `pdf.worker.min.mjs` dynamically.
- Iterates through all PDF pages.
- Joins text items into normalized page text.
- Returns `{ page, text }` entries.

Chunking behavior:

- Default chunk size is 800 characters.
- Default overlap is 100 characters.
- Chunking is per page, preserving page references.
- If possible, chunk end positions move to the last sentence boundary after the halfway point.
- Chunks with content length of 40 characters or less are skipped.

## AI Integration

`src/lib/rag.functions.ts` defines:

- Gateway base URL: `https://ai.gateway.lovable.dev/v1`
- Embedding model: `openai/text-embedding-3-small`
- Chat model: `google/gemini-3-flash-preview`

Embedding:

- `embed(texts)` posts to `/embeddings`.
- The ingestion flow batches chunk embedding calls in groups of 64.
- The embedding dimension is expected to match `vector(1536)`.

Chat:

- `chat(messages)` posts to `/chat/completions`.
- HTTP 429 and 402 responses are mapped to user-meaningful errors.
- Other non-OK responses include a shortened response body in the thrown error.

## Retrieval and Answer Generation

`askQuestion` performs the RAG loop:

1. Insert the user message into `messages`.
2. Load the latest 10 messages in chronological order for conversation context.
3. Embed the current question.
4. Call Supabase RPC `match_chunks` with `match_count: 6`.
5. Convert matches into citation objects numbered from 1.
6. Format context blocks as `[n] (filename, p.page)` followed by snippet text.
7. Ask the chat model to answer only from context and cite claims with bracketed numbers.
8. Parse bracketed citation markers from the answer.
9. Store the assistant message and citation JSON.

If no chunks are retrieved, the function stores and returns a refusal-style assistant response explaining that the uploaded documents do not address the question.

## Database Schema

The app uses Supabase tables generated by migrations in `supabase/migrations`.

### `documents`

| Column | Purpose |
| --- | --- |
| `id` | Primary UUID |
| `filename` | Original uploaded filename |
| `storage_path` | Optional path for stored PDFs |
| `page_count` | Number of extracted PDF pages |
| `status` | `processing`, `ready`, or `error` |
| `summary` | Generated document summary |
| `key_points` | JSON array of generated key points |
| `position` | User-controlled display order |
| `created_at` | Creation timestamp |

### `chunks`

| Column | Purpose |
| --- | --- |
| `id` | Primary UUID |
| `document_id` | Foreign key to `documents`, cascading on delete |
| `chunk_index` | Per-document chunk sequence |
| `page` | Source PDF page number |
| `content` | Chunk text |
| `embedding` | pgvector embedding |
| `created_at` | Creation timestamp |

### `messages`

| Column | Purpose |
| --- | --- |
| `id` | Primary UUID |
| `role` | `user` or `assistant` |
| `content` | Message text |
| `citations` | JSON citation payload |
| `created_at` | Creation timestamp |

### `match_chunks`

`public.match_chunks(query_embedding, match_count, doc_ids)` returns the nearest embedded chunks by cosine distance, joined with document filenames. The hardened migration sets `search_path = public` and allows optional filtering by document IDs.

## Security Model

- Supabase service-role access is isolated to `src/integrations/supabase/client.server.ts`.
- The service-role client is lazily initialized from server-only environment variables.
- App data server functions require `APP_ACCESS_TOKEN`.
- RLS is enabled on app tables.
- The latest migration removes open anon/authenticated table policies, leaving direct client access denied by default.
- The `pdfs` storage bucket is set to private and its open storage policies are dropped.
- Public browser configuration is limited to `VITE_` environment variables.

## Environment Variables

| Variable | Scope | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser/public | Supabase URL available at build time. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser/public | Supabase publishable key available at build time. |
| `SUPABASE_URL` | Server | Used by the service-role Supabase client. |
| `SUPABASE_PUBLISHABLE_KEY` | Server | Present in environment template; not currently central to RAG server functions. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server secret | Required for trusted database writes and reads. |
| `LOVABLE_API_KEY` | Server secret | Required for Lovable AI Gateway calls. |
| `APP_ACCESS_TOKEN` | Server secret | Shared password used by the app gate and function middleware. |

## Build and Deployment

`vite.config.ts` uses `@lovable.dev/vite-tanstack-config` and configures Nitro with the Vercel preset:

- Output directory: `.vercel/output`
- Server function directory: `.vercel/output/functions/__server.func`
- Static output directory: `.vercel/output/static`
- TanStack Start server entry: `src/server.ts`

Current scripts:

- `npm run dev`: start Vite dev server.
- `npm run build`: production build.
- `npm run build:dev`: development-mode build.
- `npm run preview`: preview built app.
- `npm run lint`: run ESLint.
- `npm run format`: run Prettier.

## Error Handling

- `src/start.ts` defines server request middleware that catches unexpected errors and returns a rendered HTML error page.
- Route-level error UI in `src/routes/__root.tsx` lets the user retry by invalidating the router.
- RAG server functions throw explicit errors for missing environment variables, failed embeddings, failed Supabase operations, rate limits, and exhausted AI credits.
- Upload and question errors are surfaced through toast notifications in the UI.

## Operational Constraints

- The app assumes text is extractable from PDFs; scanned image PDFs require OCR support before they can be indexed.
- The current chunking strategy is character-based rather than token-based.
- Conversation memory is global, not scoped by user or workspace.
- `askQuestion` accepts an optional `documentIds` field, but the current UI submits questions without document filtering.
- Uploaded PDF binary storage is not part of the active ingestion path; the app indexes extracted text and metadata.

## Verification Checklist

- Run `npm run lint` after code changes.
- Run `npm run build` before deployment.
- Verify environment variables exist in the deployment target.
- Upload a text-based PDF and confirm a document reaches `ready` status.
- Ask a question that the PDF can answer and confirm citations appear in the answer and References panel.
- Delete the document and confirm related chunks are removed through cascade behavior.
- Confirm protected server functions reject requests when `x-app-token` is absent or wrong.
