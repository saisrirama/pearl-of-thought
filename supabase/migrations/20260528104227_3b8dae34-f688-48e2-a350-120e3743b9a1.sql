
-- Vector search
create extension if not exists vector;

-- Documents
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text,
  page_count int default 0,
  status text not null default 'processing', -- processing | ready | error
  summary text,
  key_points jsonb default '[]'::jsonb,
  position int not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.documents to anon, authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;
create policy "open documents" on public.documents for all to anon, authenticated using (true) with check (true);

-- Chunks
create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index int not null,
  page int not null default 1,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index on public.chunks using hnsw (embedding vector_cosine_ops);
create index on public.chunks (document_id);
grant select, insert, update, delete on public.chunks to anon, authenticated;
grant all on public.chunks to service_role;
alter table public.chunks enable row level security;
create policy "open chunks" on public.chunks for all to anon, authenticated using (true) with check (true);

-- Messages (conversation memory)
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  role text not null, -- user | assistant
  content text not null,
  citations jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.messages to anon, authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "open messages" on public.messages for all to anon, authenticated using (true) with check (true);

-- Retrieval function
create or replace function public.match_chunks(
  query_embedding vector(1536),
  match_count int default 6,
  doc_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index int,
  page int,
  content text,
  similarity float,
  filename text
)
language sql stable
as $$
  select c.id, c.document_id, c.chunk_index, c.page, c.content,
         1 - (c.embedding <=> query_embedding) as similarity,
         d.filename
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where c.embedding is not null
    and (doc_ids is null or c.document_id = any(doc_ids))
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Storage
insert into storage.buckets (id, name, public)
values ('pdfs', 'pdfs', true)
on conflict (id) do nothing;

create policy "pdfs read" on storage.objects for select using (bucket_id = 'pdfs');
create policy "pdfs insert" on storage.objects for insert with check (bucket_id = 'pdfs');
create policy "pdfs delete" on storage.objects for delete using (bucket_id = 'pdfs');
