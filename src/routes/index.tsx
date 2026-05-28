import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Trash2,
  Search,
  Sparkles,
  Send,
  Loader2,
  BookOpen,
  X,
  ArrowUpDown,
  
  LogOut,
  Library,
  MessagesSquare,
  Quote,
} from "lucide-react";
import {
  ingestDocument,
  listDocuments,
  deleteDocument,
  reorderDocuments,
  askQuestion,
  listMessages,
  clearConversation,
  getProfile,
  deleteAccount,
  type Citation,
} from "@/lib/rag.functions";
import { signOut } from "@/lib/auth-helpers";
import { extractPdfPages, chunkPages } from "@/lib/pdf-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KnowledgeHub AI — Research notebook" },
      {
        name: "description",
        content:
          "Upload PDFs, ask grounded questions, and explore semantic citations. A premium AI research notebook.",
      },
    ],
  }),
  component: KnowledgeHub,
});

type Doc = Awaited<ReturnType<typeof listDocuments>>[number];
type Msg = Awaited<ReturnType<typeof listMessages>>[number];

type MobileTab = "sources" | "notebook" | "refs";

function KnowledgeHub() {
  const qc = useQueryClient();
  const fetchDocs = useServerFn(listDocuments);
  const fetchMsgs = useServerFn(listMessages);

  const docsQ = useQuery({ queryKey: ["docs"], queryFn: () => fetchDocs() });
  const msgsQ = useQuery({ queryKey: ["msgs"], queryFn: () => fetchMsgs() });

  const docs = docsQ.data ?? [];
  const messages = msgsQ.data ?? [];

  const activeCitations: Citation[] = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    return (last?.citations as unknown as Citation[]) ?? [];
  }, [messages]);

  const [openCitation, setOpenCitation] = useState<Citation | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("notebook");

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      <Header onClear={() => qc.invalidateQueries()} hasMessages={messages.length > 0} />

      {/* Desktop / tablet (>= md): 3-column grid */}
      <div className="hidden flex-1 min-h-0 gap-3 px-3 pb-3 md:grid md:grid-cols-[280px_minmax(0,1fr)_300px] lg:grid-cols-[320px_minmax(0,1fr)_340px]">
        <SourcesPanel docs={docs} loading={docsQ.isLoading} />
        <NotebookPanel docs={docs} messages={messages} onCitationClick={setOpenCitation} />
        <CitationsPanel citations={activeCitations} openCitation={openCitation} onSelect={setOpenCitation} />
      </div>

      {/* Mobile (< md): single panel + bottom tab bar */}
      <div className="flex flex-1 min-h-0 flex-col gap-3 px-3 pb-20 md:hidden">
        {mobileTab === "sources" && <SourcesPanel docs={docs} loading={docsQ.isLoading} />}
        {mobileTab === "notebook" && (
          <NotebookPanel docs={docs} messages={messages} onCitationClick={(c) => { setOpenCitation(c); setMobileTab("refs"); }} />
        )}
        {mobileTab === "refs" && (
          <CitationsPanel citations={activeCitations} openCitation={openCitation} onSelect={setOpenCitation} />
        )}
      </div>

      <MobileTabBar
        active={mobileTab}
        onChange={setMobileTab}
        sourceCount={docs.length}
        refCount={activeCitations.length}
      />
    </div>
  );
}

/* ------------------------------ HEADER ------------------------------ */
function Header({ onClear, hasMessages }: { onClear: () => void; hasMessages: boolean }) {
  const clearFn = useServerFn(clearConversation);
  return (
    <header className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5 sm:py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <BookOpen className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h1 className="font-serif text-lg leading-none">KnowledgeHub</h1>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Research notebook
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {hasMessages && (
          <button
            onClick={async () => {
              await clearFn();
              onClear();
              toast.success("Conversation cleared");
            }}
            className="hidden rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground sm:inline-block"
          >
            Clear conversation
          </button>
        )}
        <AccountMenu />
      </div>
    </header>
  );
}

function AccountMenu() {
  const fetchProfile = useServerFn(getProfile);
  const deleteAcctFn = useServerFn(deleteAccount);
  const [open, setOpen] = useState(false);
  const profileQ = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const profile = profileQ.data;

  const initials = profile
    ? `${profile.first_name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`.toUpperCase() || "?"
    : "?";

  useEffect(() => {
    if (!open) return;
    const onDoc = () => setOpen(false);
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-xs font-medium text-foreground hover:bg-accent"
        aria-label="Account"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-60 rounded-xl border border-border bg-card p-2 shadow-panel">
          <div className="px-3 py-2">
            <p className="text-sm font-medium">
              {profile ? `${profile.first_name} ${profile.last_name}` : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground">@{profile?.username ?? ""}</p>
          </div>
          <div className="my-1 border-t border-border" />
          <button
            onClick={async () => {
              await signOut();
              toast.success("Signed out");
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-secondary"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
          <button
            onClick={async () => {
              if (!confirm("Delete your account? This permanently removes your documents and conversations.")) return;
              try {
                await deleteAcctFn();
                await signOut();
                toast.success("Account deleted");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed to delete account");
              }
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete account
          </button>
        </div>
      )}
    </div>
  );
}

function MobileTabBar({
  active,
  onChange,
  sourceCount,
  refCount,
}: {
  active: MobileTab;
  onChange: (t: MobileTab) => void;
  sourceCount: number;
  refCount: number;
}) {
  const tabs: Array<{ id: MobileTab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }> = [
    { id: "sources", label: "Sources", icon: Library, count: sourceCount },
    { id: "notebook", label: "Notebook", icon: MessagesSquare },
    { id: "refs", label: "Refs", icon: Quote, count: refCount },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-border bg-surface/95 backdrop-blur md:hidden">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2.5 text-[10px] uppercase tracking-wide",
              isActive ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <div className="relative">
              <Icon className="h-4 w-4" />
              {typeof t.count === "number" && t.count > 0 && (
                <span className="absolute -right-2 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-primary px-1 text-[9px] leading-none text-primary-foreground">
                  {t.count}
                </span>
              )}
            </div>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------ LEFT: SOURCES ------------------------------ */
function SourcesPanel({ docs, loading }: { docs: Doc[]; loading: boolean }) {
  const qc = useQueryClient();
  const ingestFn = useServerFn(ingestDocument);
  const deleteFn = useServerFn(deleteDocument);
  const reorderFn = useServerFn(reorderDocuments);
  const [query, setQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  const onFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
      if (list.length === 0) {
        toast.error("Only PDF files are supported");
        return;
      }
      for (const file of list) {
        setUploading((u) => [...u, file.name]);
        const t = toast.loading(`Indexing ${file.name}…`);
        try {
          const pages = await extractPdfPages(file);
          const chunks = chunkPages(pages);
          if (chunks.length === 0) throw new Error("No extractable text found");
          await ingestFn({
            data: {
              filename: file.name,
              pageCount: pages.length,
              chunks,
            },
          });
          toast.success(`Indexed ${file.name}`, { id: t });
          qc.invalidateQueries({ queryKey: ["docs"] });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Upload failed", { id: t });
        } finally {
          setUploading((u) => u.filter((n) => n !== file.name));
        }
      }
    },
    [ingestFn, qc],
  );

  const filtered = docs.filter((d) => d.filename.toLowerCase().includes(query.toLowerCase()));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
  };

  const onItemDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = docs.map((d) => d.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null);
    await reorderFn({ data: { ids } });
    qc.invalidateQueries({ queryKey: ["docs"] });
  };

  return (
    <aside className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-surface shadow-panel md:flex-none">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Sources
        </h2>
        <span className="text-[11px] text-muted-foreground">{docs.length}</span>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "mx-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-center transition-all",
          dragOver && "border-primary/40 bg-accent/40",
        )}
      >
        <div className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-foreground/70">
          <Upload className="h-4 w-4" />
        </div>
        <p className="mt-2 text-sm">Drop a PDF or click to upload</p>
        <p className="text-[11px] text-muted-foreground">Parsed locally, embedded for semantic search</p>
        <input
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && onFiles(e.target.files)}
        />
      </label>

      <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sources"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {docs.length > 1 && <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>

      <div className="mt-3 flex-1 overflow-y-auto px-3 pb-3">
        {loading && <p className="px-2 py-4 text-sm text-muted-foreground">Loading…</p>}
        {!loading && filtered.length === 0 && uploading.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No sources yet. Upload a PDF to start.
          </p>
        )}
        {uploading.map((name) => (
          <div
            key={name}
            className="mb-1.5 flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span className="truncate text-xs">{name}</span>
          </div>
        ))}
        {filtered.map((doc) => (
          <article
            key={doc.id}
            draggable
            onDragStart={() => setDragId(doc.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onItemDrop(doc.id)}
            className={cn(
              "group mb-1.5 flex cursor-grab items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-sm transition-shadow hover:shadow-float",
              dragId === doc.id && "opacity-40",
            )}
          >
            <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-tight">{doc.filename}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {doc.status === "processing" && (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" /> Indexing
                  </span>
                )}
                {doc.status === "ready" && `${doc.page_count} pages`}
                {doc.status === "error" && <span className="text-destructive">Failed</span>}
              </p>
            </div>
            <button
              onClick={async () => {
                await deleteFn({ data: { id: doc.id } });
                qc.invalidateQueries({ queryKey: ["docs"] });
                toast.success("Source removed");
              }}
              className="rounded p-1 text-muted-foreground opacity-100 transition-opacity hover:bg-secondary hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
              aria-label="Remove source"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </article>
        ))}
      </div>
    </aside>
  );
}

/* ------------------------------ CENTER: NOTEBOOK ------------------------------ */
function NotebookPanel({
  docs,
  messages,
  onCitationClick,
}: {
  docs: Doc[];
  messages: Msg[];
  onCitationClick: (c: Citation) => void;
}) {
  const qc = useQueryClient();
  const askFn = useServerFn(askQuestion);
  const [input, setInput] = useState("");

  const ask = useMutation({
    mutationFn: (message: string) => askFn({ data: { message } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["msgs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Request failed"),
  });

  const readyDocs = docs.filter((d) => d.status === "ready" && d.summary);
  const hasSources = docs.length > 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-surface-raised shadow-panel md:flex-none">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-4 sm:px-8 md:pt-8 md:px-12 lg:px-16">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 md:mb-8">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Notebook
            </p>
            <h1 className="font-serif text-2xl leading-tight sm:text-3xl">
              {hasSources
                ? "Ask anything about your sources."
                : "A quiet place to think with your documents."}
            </h1>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              {hasSources
                ? "Answers are grounded in your uploaded documents and cited inline."
                : "Upload a PDF in the Sources tab. We'll parse it, chunk it semantically, and embed it for retrieval."}
            </p>
          </div>

          {readyDocs.length > 0 && (
            <div className="mb-6 grid gap-3 sm:mb-8 sm:grid-cols-2">
              {readyDocs.slice(0, 4).map((doc) => (
                <SummaryCard key={doc.id} doc={doc} />
              ))}
            </div>
          )}

          <div className="space-y-6">
            {messages.map((m) => (
              <Message
                key={m.id}
                role={m.role}
                content={m.content}
                citations={(m.citations as unknown as Citation[]) ?? []}
                onCitationClick={onCitationClick}
              />
            ))}
            {ask.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Retrieving and reasoning…
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border px-4 py-3 sm:px-6 sm:py-4 md:px-10 lg:px-14">
        <div className="mx-auto max-w-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!input.trim() || ask.isPending) return;
              if (!hasSources) {
                toast.error("Upload a source first");
                return;
              }
              const m = input.trim();
              setInput("");
              ask.mutate(m);
            }}
            className="flex items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-float focus-within:border-primary/30 sm:px-4 sm:py-3"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                }
              }}
              rows={1}
              placeholder={hasSources ? "Ask a question about your sources…" : "Upload a PDF to begin"}
              className="max-h-40 flex-1 resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={!input.trim() || ask.isPending}
              className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
              aria-label="Send"
            >
              {ask.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </form>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Grounded in your documents · cites every claim
          </p>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({ doc }: { doc: Doc }) {
  const keyPoints = (doc.key_points as unknown as string[]) ?? [];
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-float">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3 w-3 text-citation" />
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Auto summary
        </span>
      </div>
      <h3 className="mt-2 truncate font-serif text-base leading-tight" title={doc.filename}>
        {doc.filename}
      </h3>
      {doc.summary && (
        <div
          className={cn(
            "mt-2 overflow-y-auto pr-1 text-[13px] leading-relaxed text-foreground/80",
            expanded ? "max-h-72" : "max-h-24",
          )}
        >
          {doc.summary}
        </div>
      )}
      {keyPoints.length > 0 && (
        <ul className="mt-3 space-y-1">
          {keyPoints.slice(0, expanded ? keyPoints.length : 3).map((p, i) => (
            <li key={i} className="flex gap-2 text-[12px] text-muted-foreground">
              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-citation/60" />
              <span className={expanded ? "" : "line-clamp-2"}>{p}</span>
            </li>
          ))}
        </ul>
      )}
      {(doc.summary || keyPoints.length > 3) && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 self-start text-[11px] font-medium text-citation hover:underline"
        >
          {expanded ? "Show less" : "Read full summary"}
        </button>
      )}
    </article>
  );
}

function Message({
  role,
  content,
  citations,
  onCitationClick,
}: {
  role: string;
  content: string;
  citations: Citation[];
  onCitationClick: (c: Citation) => void;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-accent px-4 py-2.5 text-[14px] text-accent-foreground">
          {content}
        </div>
      </div>
    );
  }
  const byN = new Map(citations.map((c) => [c.n, c]));
  return (
    <div className="prose prose-sm max-w-none text-foreground prose-headings:font-serif prose-headings:font-normal prose-p:leading-relaxed prose-strong:text-foreground">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="my-2 leading-relaxed">{interleaveCitations(children, byN, onCitationClick)}</p>,
          li: ({ children }) => <li>{interleaveCitations(children, byN, onCitationClick)}</li>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function interleaveCitations(
  children: React.ReactNode,
  byN: Map<number, Citation>,
  onClick: (c: Citation) => void,
) {
  const walk = (node: React.ReactNode): React.ReactNode => {
    if (typeof node === "string") {
      const parts = node.split(/(\[\d+\])/g);
      return parts.map((p, i) => {
        const m = p.match(/^\[(\d+)\]$/);
        if (m) {
          const c = byN.get(parseInt(m[1], 10));
          if (c) return <CitationPill key={i} c={c} onClick={() => onClick(c)} />;
        }
        return <span key={i}>{p}</span>;
      });
    }
    if (Array.isArray(node)) return node.map((n, i) => <span key={i}>{walk(n)}</span>);
    return node;
  };
  return walk(children);
}

function CitationPill({ c, onClick }: { c: Citation; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-citation px-1.5 align-[2px] text-[10px] font-medium leading-none text-citation-foreground transition-transform hover:scale-110"
      aria-label={`Citation ${c.n}: ${c.filename} page ${c.page}`}
    >
      {c.n}
    </button>
  );
}

/* ------------------------------ RIGHT: CITATIONS ------------------------------ */
function CitationsPanel({
  citations,
  openCitation,
  onSelect,
}: {
  citations: Citation[];
  openCitation: Citation | null;
  onSelect: (c: Citation | null) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-surface shadow-panel md:flex-none">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          References
        </h2>
        <span className="text-[11px] text-muted-foreground">{citations.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {citations.length === 0 && (
          <p className="mt-12 text-center text-xs text-muted-foreground">
            Citations from the most recent answer will appear here.
          </p>
        )}

        {citations.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {citations.map((c) => (
              <button
                key={c.chunkId}
                onClick={() => onSelect(c)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                  openCitation?.chunkId === c.chunkId
                    ? "border-citation bg-citation text-citation-foreground"
                    : "border-border bg-card text-foreground hover:border-citation/50",
                )}
              >
                <span className="font-medium">{c.n}</span>
                <span className="text-[10px] opacity-70">p.{c.page}</span>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {(openCitation ? [openCitation] : citations).map((c) => (
            <article
              key={c.chunkId}
              className={cn(
                "rounded-xl border bg-card p-3.5 text-[12.5px] shadow-float transition-all",
                openCitation?.chunkId === c.chunkId ? "border-citation/40" : "border-border",
              )}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-citation text-[10px] font-medium text-citation-foreground">
                      {c.n}
                    </span>
                    <p className="truncate text-[12px] font-medium" title={c.filename}>
                      {c.filename}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">
                    Page {c.page} · {(c.similarity * 100).toFixed(0)}% relevance
                  </p>
                </div>
                {openCitation?.chunkId === c.chunkId && (
                  <button
                    onClick={() => onSelect(null)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-secondary"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <p className="leading-relaxed text-foreground/80">{c.snippet}</p>
            </article>
          ))}
        </div>
      </div>
    </aside>
  );
}
