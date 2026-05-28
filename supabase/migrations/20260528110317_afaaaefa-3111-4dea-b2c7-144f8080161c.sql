
-- 1) Replace permissive RLS policies on app tables with deny-all for anon/authenticated.
--    All data access happens via server functions using the service role, which bypasses RLS.
DROP POLICY IF EXISTS "open documents" ON public.documents;
DROP POLICY IF EXISTS "open chunks" ON public.chunks;
DROP POLICY IF EXISTS "open messages" ON public.messages;

-- Ensure RLS stays enabled (already is, but explicit for clarity)
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chunks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- No policies => default deny for anon/authenticated. service_role bypasses RLS.

-- 2) Lock down the pdfs storage bucket (currently public + open policies; unused by app)
UPDATE storage.buckets SET public = false WHERE id = 'pdfs';

DROP POLICY IF EXISTS "pdfs read"   ON storage.objects;
DROP POLICY IF EXISTS "pdfs insert" ON storage.objects;
DROP POLICY IF EXISTS "pdfs delete" ON storage.objects;

-- 3) Fix mutable search_path on match_chunks (security hardening)
CREATE OR REPLACE FUNCTION public.match_chunks(
  query_embedding vector,
  match_count integer DEFAULT 6,
  doc_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS TABLE(id uuid, document_id uuid, chunk_index integer, page integer, content text, similarity double precision, filename text)
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  select c.id, c.document_id, c.chunk_index, c.page, c.content,
         1 - (c.embedding <=> query_embedding) as similarity,
         d.filename
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where c.embedding is not null
    and (doc_ids is null or c.document_id = any(doc_ids))
  order by c.embedding <=> query_embedding
  limit match_count;
$function$;
