# KnowledgeHub AI

KnowledgeHub AI is a PDF research notebook that turns uploaded documents into searchable sources, then answers questions with Retrieval-Augmented Generation (RAG) and inspectable citations.

The app is built as a TanStack Start React application with server functions, Supabase Postgres + `pgvector`, Supabase Auth, browser-side PDF parsing, and Lovable AI Gateway for embeddings and chat completion.

## Quick Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create a local `.env` file:

   ```sh
   VITE_SUPABASE_URL="your-supabase-url"
   VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-key"
   SUPABASE_URL="your-supabase-url"
   SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-key"
   SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
   LOVABLE_API_KEY="your-lovable-api-key"
   ```

   There is no Groq key required. AI calls go through the Lovable AI Gateway using `LOVABLE_API_KEY`.

3. Apply the Supabase migrations if the database has not already been provisioned:

   ```sh
   supabase db push
   ```

4. Start the development server:

   ```sh
   npm run dev
   ```

5. Open the local URL printed by Vite, usually [http://localhost:5173](http://localhost:5173).

Useful scripts:

- `npm run dev` - start the local Vite/TanStack Start dev server
- `npm run build` - create a production build
- `npm run preview` - preview the production build locally
- `npm run lint` - run ESLint
- `npm run format` - format with Prettier

## Architecture Overview

```text
Browser / React UI
  |
  | Sign up / sign in with username + password
  v
Supabase Auth issues JWT
  |
  | Upload PDF
  v
pdfjs-dist extracts page text in the browser
  |
  v
Client chunks text by page (~800 chars, 100 overlap)
  |
  v
TanStack server function: ingestDocument
  |
  | batch embeddings via Lovable AI Gateway
  v
Supabase Postgres + pgvector
  |
  | match_chunks(query_embedding, top_k=6, user docs only)
  v
TanStack server function: askQuestion
  |
  | grounded prompt + recent conversation context
  v
Lovable AI Gateway chat model
  |
  v
Persisted answer + citation JSON shown in the notebook
```

The main UI lives in [src/routes/index.tsx](src/routes/index.tsx). It is organized into three working panels: Sources, Notebook, and References. Server-side RAG operations live in [src/lib/rag.functions.ts](src/lib/rag.functions.ts), PDF extraction and chunking live in [src/lib/pdf-client.ts](src/lib/pdf-client.ts), and database schema lives in [supabase/migrations/](supabase/migrations/).

## Productionizing and Scaling

To productionize this solution on AWS, GCP, Azure, or Cloudflare, I would keep the current application shape but harden the infrastructure and operational model:

- **Runtime:** deploy the TanStack Start app to a managed edge/serverless runtime such as Cloudflare Workers, Vercel, AWS Lambda, Azure Functions, or Cloud Run. For long PDF ingestion jobs, move ingestion into a background worker rather than keeping everything in an interactive request.
- **Database:** run managed Postgres with `pgvector` such as Supabase, AWS RDS/Aurora PostgreSQL, AlloyDB, Azure Database for PostgreSQL, or Neon. Add connection pooling, backups, PITR, migration gates, and separate dev/staging/prod projects.
- **Async processing:** introduce a queue for ingestion and embedding work, for example SQS, Pub/Sub, Cloud Tasks, Azure Queue Storage, or Cloudflare Queues. The UI would poll or subscribe to document indexing status.
- **File storage:** persist original PDFs in object storage such as S3, GCS, Azure Blob Storage, Cloudflare R2, or Supabase Storage with private buckets, signed URLs, malware scanning, size limits, and lifecycle policies.
- **Auth and tenancy:** keep Supabase Auth or replace it with Cognito, Firebase Auth, Entra ID, Auth0, or Clerk. Enforce tenant boundaries in both application queries and database RLS.
- **AI provider layer:** keep Lovable AI Gateway for the current implementation, but production should support provider fallback, request timeouts, retry policy, token/cost tracking, and model version pinning.
- **Security:** rotate secrets through a cloud secret manager, restrict service-role keys to server code, add rate limits, audit logs, CSP headers, and abuse controls for uploads and model calls.
- **Observability:** add structured logs, traces, metrics, model latency/cost dashboards, ingestion failure dashboards, and user-facing error correlation IDs.
- **Quality gates:** add automated tests, RAG regression evaluations, prompt snapshot tests, migration checks, lint/type/build checks in CI, and deployment promotion through staging.

## RAG and LLM Approach

### Final Choices

- **LLM:** `google/gemini-3-flash-preview` via Lovable AI Gateway.
- **Embedding model:** `openai/text-embedding-3-small` via Lovable AI Gateway.
- **Vector database:** Supabase Postgres with `pgvector`, using a `vector(1536)` embedding column and HNSW cosine index.
- **Orchestration framework:** custom TanStack `createServerFn` functions rather than LangChain or LlamaIndex.
- **Parsing:** `pdfjs-dist` in the browser to preserve page boundaries without adding server-side PDF binaries.

### Choices Considered

- **Separate vector DB vs Postgres `pgvector`:** a dedicated vector database could scale independently, but `pgvector` keeps document metadata, chunks, messages, and retrieval transactional in one database. For this project, simplicity and consistency mattered more than independent vector infrastructure.
- **Backend API service vs server functions:** a FastAPI-style backend would be familiar and portable, but TanStack server functions reduced moving parts and matched Lovable/TanStack Start deployment.
- **Framework orchestration vs custom RAG:** LangChain or LlamaIndex would add reusable abstractions, but the RAG flow here is small and explicit: embed, retrieve, format context, prompt, parse citations, persist.
- **Server PDF parsing vs browser PDF parsing:** server parsing centralizes ingestion, but browser parsing avoids native PDF/runtime compatibility issues and keeps page-aware text extraction close to the upload interaction.

### Prompt and Context Management

The question-answering path embeds the current question, retrieves the top 6 matching chunks from the signed-in user's documents, and formats them as numbered context blocks:

```text
[1] (filename.pdf, p.3)
source snippet...
```

The system prompt tells the model to answer only from the provided context, cite claims with bracketed citation numbers, and say plainly when the context does not answer the question. The server also includes the most recent conversation messages for follow-up continuity.

### Guardrails, Quality, and Observability

Implemented guardrails:

- Server functions require a valid Supabase JWT through `requireSupabaseAuth`.
- Retrieval is restricted to documents owned by the authenticated user.
- Inputs are validated with Zod.
- The model is instructed not to invent facts outside the retrieved context.
- If retrieval returns no chunks, the app returns a no-answer response instead of asking the model to guess.
- Citations are filtered to citation markers actually used by the model, with a fallback to the top retrieved chunks if the model omits markers.
- Rate-limit and exhausted-credit AI responses are mapped to clearer errors.

What is still needed for stronger quality:

- A golden evaluation set of PDFs, questions, expected answer traits, and expected citation pages.
- Automated faithfulness checks for generated answers.
- Retrieval quality metrics such as recall@k and citation hit rate.
- Prompt/version tracking for every answer.
- Structured telemetry for embedding latency, chat latency, token usage, and cost.

## Key Technical Decisions

- **TanStack Start + server functions:** keeps UI and server logic in one TypeScript app while preserving server-only access to privileged Supabase operations.
- **Supabase Auth with username-based synthetic emails:** gives the app real JWTs and user-scoped data without requiring users to provide email addresses.
- **Service-role Supabase client only on the server:** trusted writes and admin operations happen in server functions, while browser code uses the publishable client.
- **User-scoped rows and RLS:** documents, messages, chunks, and profiles are tied to `auth.users`, with policies ensuring users only access their own data.
- **Browser PDF extraction:** avoids edge/server PDF parsing complexity and keeps page numbers attached to chunks for citations.
- **`pgvector` in Postgres:** avoids a separate vector service and allows chunk deletion to cascade when a document is deleted.
- **Explicit RAG flow:** the retrieval and prompting logic is readable in one file, which is easier to review for a project of this size.

## Engineering Standards

Standards followed:

- TypeScript-first implementation with typed server function inputs and shared types.
- Zod validation for server-function payloads.
- Server-only secrets kept out of `VITE_` browser variables.
- RLS and user ownership for app data.
- Clear separation between PDF parsing, auth helpers, Supabase clients, UI routes, and RAG functions.
- ESLint and Prettier scripts are included.
- UI states for loading, empty documents, upload errors, indexing, citations, and account actions.

Standards skipped or incomplete due to time:

- No dedicated automated test suite is currently included.
- No CI pipeline is configured in the repo.
- No RAG evaluation harness or benchmark dataset is included.
- No background job queue yet; ingestion currently runs through server functions.
- No full observability stack yet beyond console logging and user-facing errors.

## How AI Tools Were Used

AI tools were used as a development accelerator for:

- Designing and iterating on the RAG architecture.
- Generating and refining TanStack Start, Supabase, and UI implementation details.
- Producing database migrations for documents, chunks, messages, profiles, RLS, and vector search.
- Improving the README and technical documentation.
- Reviewing implementation choices against the live codebase to avoid stale setup instructions.

Human review was still needed for product decisions, security trade-offs, environment setup, and final acceptance of the implementation.

## What I Would Do Differently With More Time

- Move ingestion into an asynchronous worker with resumable progress, retries, and partial failure recovery.
- Add a test suite covering auth, chunking, server function validation, document lifecycle, and citation parsing.
- Build a RAG evaluation harness with representative PDFs and regression questions.
- Add observability for token usage, retrieval quality, latency, error rates, and per-user cost.
- Support document subset selection in the UI when asking questions.
- Persist original PDFs and add citation deep links to rendered PDF pages.
- Add file type expansion for Markdown, HTML, DOCX, and plain text.
- Add stricter production controls: upload limits, rate limits, secret rotation, audit logs, and abuse detection.
- Consider provider fallback and model routing once usage patterns are clearer.

## Project Structure

- [src/routes/](src/routes/) - app routes and panels
- [src/components/](src/components/) - UI components, including the auth gate
- [src/lib/rag.functions.ts](src/lib/rag.functions.ts) - ingestion, retrieval, chat, summaries, account actions
- [src/lib/pdf-client.ts](src/lib/pdf-client.ts) - browser-side PDF parsing and chunking
- [src/lib/auth-helpers.ts](src/lib/auth-helpers.ts) - username/password auth helpers
- [src/integrations/supabase/](src/integrations/supabase/) - Supabase clients, auth middleware, generated types
- [supabase/migrations/](supabase/migrations/) - database schema, RLS, storage, and vector search setup
- [src/styles.css](src/styles.css) - TailwindCSS styles

## Notes

- Local development runs the frontend and server functions in one Vite process.
- PDF parsing happens in the browser, while embeddings, summaries, retrieval, and chat run in server functions.
- Supabase stores profiles, documents, chunks, messages, auth data, and `vector(1536)` embeddings.
- See [ARCHITECTURE.md](ARCHITECTURE.md) for additional design notes.
