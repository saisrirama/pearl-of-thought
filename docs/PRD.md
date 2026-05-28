# Product Requirements Document: KnowledgeHub AI

## Overview

KnowledgeHub AI is a single-user AI research notebook for working with PDF source material. Users upload PDF documents, the app extracts and chunks the text, indexes the chunks into a vector store, generates concise document summaries, and answers user questions with citations grounded in the uploaded sources.

The product is implemented as a TanStack Start React application with type-safe server functions, Supabase Postgres with pgvector for persistence and retrieval, browser-side PDF parsing through `pdfjs-dist`, and Lovable AI Gateway for embeddings and chat completion.

## Goals

- Let a user upload one or more PDF documents and turn them into searchable research sources.
- Provide generated summaries and key points for indexed documents.
- Support natural-language questions over uploaded documents using retrieval-augmented generation.
- Return grounded answers with inline citation markers that map to source snippets, filenames, page numbers, and relevance scores.
- Keep the user experience focused on document thinking: sources on the left, notebook conversation in the center, and references on the right.
- Protect the app behind a shared access password before server functions can be used.

## Non-Goals

- Multi-user account management is not currently implemented.
- User-scoped document ownership is not currently implemented.
- General web search, crawling, or non-PDF ingestion is not currently implemented.
- Native PDF rendering or page-image highlighting is not currently implemented.
- Offline local vector search is not currently implemented.
- Public unauthenticated access to document data is not intended.

## Target Users

- Researchers who need to ask questions across PDFs while preserving traceability.
- Students and analysts who want quick summaries and cited answers from source material.
- Internal reviewers working with document sets where every answer should be grounded.

## Primary User Journey

1. The user opens KnowledgeHub and enters the configured access password.
2. The user uploads one or more PDF files from the Sources panel.
3. The browser extracts page text from each PDF and chunks it into semantic passages.
4. The server stores a document row, embeds chunks, inserts them into Supabase, and generates a summary.
5. The document appears as ready, with page count and generated summary content.
6. The user asks a question in the Notebook panel.
7. The server embeds the question, retrieves relevant chunks via `match_chunks`, asks the chat model for a grounded answer, and persists both user and assistant messages.
8. The user reads the answer with citation pills, then inspects supporting snippets in the References panel.

## Functional Requirements

### Access Gate

- The app must block the main notebook UI until the user submits a valid access password.
- The password must be verified by the `verifyAppToken` server function against `APP_ACCESS_TOKEN`.
- After a successful verification, the token must be stored in browser local storage and attached to future server function calls through the `x-app-token` header.
- Protected server functions must reject requests without the expected shared token.

### PDF Upload and Parsing

- The Sources panel must accept drag-and-drop and file picker uploads.
- The app must accept PDF files by MIME type or `.pdf` extension.
- Unsupported uploads must show an error toast.
- PDF text extraction must run in the browser using `pdfjs-dist`.
- Extracted page numbers must be preserved so citations can point back to source pages.
- Empty or image-only PDFs with no extractable text must fail with a clear upload error.

### Chunking

- The client must chunk extracted page text before ingestion.
- Default chunking must use approximately 800 characters with 100 characters of overlap.
- Chunking should prefer sentence boundaries when possible.
- Chunks shorter than the current minimum useful threshold must be skipped.
- Each chunk must include page number, index, and content.

### Document Ingestion

- The server must create a `documents` row with `processing` status before embedding chunks.
- The server must embed chunk content through Lovable AI Gateway using `openai/text-embedding-3-small`.
- Embedding requests must be batched in groups of 64 chunks.
- Inserted chunk rows must include document ID, chunk index, page, content, and embedding.
- If ingestion succeeds, the document status must become `ready`.
- If ingestion fails after the document row is created, the document status must become `error`.

### Summaries

- The server must summarize the first several chunks of an ingested document.
- The summary response should be parsed into a `summary` string and `keyPoints` array when the model returns JSON.
- If JSON parsing fails, the app should still store a fallback summary string.
- The Notebook panel must show summary cards for ready documents that have summary content.

### Source Management

- The Sources panel must list indexed documents with filename, status, and page count.
- The user must be able to filter sources by filename.
- The user must be able to delete a document.
- Deleting a document must remove its chunks through database cascade behavior.
- The user must be able to reorder documents, and order must persist through the `position` field.

### Question Answering

- The user must be able to ask a question only after at least one source exists.
- The server must persist the user's message before generating an answer.
- The server must retrieve recent message history for follow-up context.
- The server must embed the user's question and call `match_chunks` with a default match count of 6.
- If no chunks match, the assistant must return a plain response saying the uploaded documents do not address the question.
- If chunks match, the assistant prompt must instruct the model to answer only from provided context and cite claims with bracketed numbers.
- The assistant response and selected citations must be persisted in `messages`.

### Citations

- Citations must include citation number, chunk ID, document ID, filename, page, snippet, and similarity score.
- The UI must render citation markers as interactive pills when they correspond to returned citation data.
- The References panel must show citations from the latest assistant message.
- The References panel must support selecting a citation and viewing filename, page, relevance, and snippet.
- If the model omits bracketed citations despite retrieved context, the system may fall back to showing the top retrieved citations.

## Data Requirements

### Documents

Document records must track:

- `id`
- `filename`
- `storage_path`
- `page_count`
- `status`
- `summary`
- `key_points`
- `position`
- `created_at`

### Chunks

Chunk records must track:

- `id`
- `document_id`
- `chunk_index`
- `page`
- `content`
- `embedding`
- `created_at`

### Messages

Message records must track:

- `id`
- `role`
- `content`
- `citations`
- `created_at`

## UX Requirements

- The first screen after unlock should be the working notebook, not a marketing landing page.
- The layout should use three main working areas: Sources, Notebook, and References.
- Empty states should clearly tell the user what action is available next.
- Uploading, indexing, asking, and errors must provide visible feedback.
- Answers should render Markdown.
- Citation interactions must be lightweight and inspectable without leaving the notebook.

## Security Requirements

- Server functions that read or mutate research data must require the shared app token.
- The Supabase service role key must only be used server-side.
- Server-only environment variables must not be exposed through the browser bundle.
- Public `VITE_` variables may only contain non-secret client configuration.
- Supabase RLS must remain enabled, with direct anon/authenticated access denied for app tables.
- The `pdfs` storage bucket is currently locked down and not used by the app ingestion flow.

## Configuration Requirements

The deployed app requires these environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LOVABLE_API_KEY`
- `APP_ACCESS_TOKEN`

## Success Metrics

- A text-based PDF can be uploaded, indexed, summarized, and queried successfully.
- Answers include source-grounded citation references for claims.
- Document deletion removes related chunks.
- Protected server functions reject requests without the configured app token.
- The app builds successfully for the configured Vercel target.

## Open Questions

- Should the app evolve from shared-token access to user accounts and per-user document ownership?
- Should uploaded PDF files be persisted in Supabase Storage, or is extracted-text ingestion sufficient?
- Should users be able to select a subset of documents for each question?
- Should citations link to rendered PDF pages or highlighted text previews?
- Should ingestion support additional file types such as Markdown, DOCX, HTML, or plain text?
