import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { signIn, signUp } from "@/lib/auth-helpers";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      qc.invalidateQueries();
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, [qc]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return <AuthScreen />;
  return <>{children}</>;
}

function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!username.trim() || !firstName.trim() || !lastName.trim() || password.length < 6) {
          throw new Error("Fill in all fields. Password must be at least 6 characters.");
        }
        await signUp({ username, password, firstName, lastName });
        toast.success(`Welcome, ${firstName}!`);
      } else {
        await signIn(username, password);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      toast.error(msg.replace(/@knowledgehub\.local/g, ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="h-4 w-4" />
          </div>
          <div>
            <h1 className="font-serif text-xl leading-none">KnowledgeHub</h1>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Research notebook
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-panel">
          <div className="mb-5 flex gap-1 rounded-lg bg-secondary p-1 text-sm">
            <button
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-md px-3 py-1.5 ${mode === "signin" ? "bg-card shadow-float" : "text-muted-foreground"}`}
            >
              Sign in
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md px-3 py-1.5 ${mode === "signup" ? "bg-card shadow-float" : "text-muted-foreground"}`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="First name" value={firstName} onChange={setFirstName} autoComplete="given-name" />
                <Field label="Last name" value={lastName} onChange={setLastName} autoComplete="family-name" />
              </div>
            )}
            <Field label="Username" value={username} onChange={setUsername} autoComplete="username" />
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Each account keeps its own private documents and conversations.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/40"
      />
    </label>
  );
}
