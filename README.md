# KnowledgeHub AI

A premium AI research notebook with a Retrieval-Augmented Generation pipeline.

## Features

- PDF upload, parsing, and semantic chunking
- Vector search with PostgreSQL `pgvector`
- Local deterministic embeddings for document retrieval
- Grounded conversational QA with citations
- Summarization and key point extraction
- Three-panel UI: Sources, Notebook, Citations

## Stack

- **Frontend:** TanStack Start (React 19), TailwindCSS v4, shadcn/ui
- **Backend:** Python FastAPI
- **Database:** PostgreSQL + `pgvector`
- **Embeddings:** Local deterministic 1536-dimensional vectors
- **Chat/Summarization:** Groq OpenAI-compatible chat API
- **PDF Parsing:** `pdfjs-dist` in the browser

## Setup

1. Install frontend dependencies:

   ```sh
   bun install
   ```

2. Configure environment variables:

   ```sh
   cp .env.example .env
   ```

   Required values:
   - `DATABASE_URL`
   - `VITE_API_BASE_URL`
   - `APP_ACCESS_TOKEN`
   - `GROQ_API_KEY`

3. Start PostgreSQL with `pgvector` available, then run the FastAPI backend:

   ```sh
   python -m venv .venv
   ./.venv/bin/pip install -r backend/requirements.txt
   ./.venv/bin/uvicorn backend.app.main:app --reload --reload-dir backend --port 8000
   ```

   FastAPI applies [backend/schema.sql](backend/schema.sql) on startup when `AUTO_MIGRATE=true`.

4. Run the frontend:

   ```sh
   bun dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

## Project Structure

- [backend/](backend/) - FastAPI app, Postgres schema, RAG backend
- [src/components/](src/components/) - UI components
- [src/lib/](src/lib/) - API client, PDF parsing, app token storage
- [src/routes/](src/routes/) - App routes and panels
- [src/styles.css](src/styles.css) - TailwindCSS styles

## API

The FastAPI app lives in [backend/app/main.py](backend/app/main.py).

- `POST /auth/verify` - shared-password unlock check
- `GET /documents` - list sources
- `POST /documents/ingest` - store document chunks, embeddings, and summary
- `DELETE /documents/{id}` - delete a source and its chunks
- `PATCH /documents/order` - persist source ordering
- `GET /messages` - list conversation history
- `DELETE /messages` - clear conversation history
- `POST /chat` - retrieve chunks, generate answer, persist citations

All protected endpoints require the `x-app-token` header matching `APP_ACCESS_TOKEN`.

## Notes

- PDF parsing still happens in-browser for fast local text extraction and page-aware citations.
- PostgreSQL stores documents, chunks, messages, and `vector(1536)` embeddings.
- The previous Supabase client and migrations have been replaced by FastAPI plus direct PostgreSQL access.
