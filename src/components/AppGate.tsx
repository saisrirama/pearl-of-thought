import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { verifyAppToken } from "@/lib/auth.functions";
import { getAppToken, setAppToken } from "@/lib/app-token";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AppGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const verify = useServerFn(verifyAppToken);

  useEffect(() => {
    setUnlocked(Boolean(getAppToken()));
    setChecking(false);
    const onChange = () => setUnlocked(Boolean(getAppToken()));
    window.addEventListener("app-token-changed", onChange);
    return () => window.removeEventListener("app-token-changed", onChange);
  }, []);

  if (checking) return null;
  if (unlocked) return <>{children}</>;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await verify({ data: { token: password } });
      if (res.ok) {
        setAppToken(password);
      } else {
        setError("Incorrect password.");
      }
    } catch {
      setError("Could not verify. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div>
          <h1 className="font-serif text-2xl text-foreground">KnowledgeHub</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter the access password to continue.</p>
        </div>
        <Input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Access password"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting || password.length === 0} className="w-full">
          {submitting ? "Checking…" : "Unlock"}
        </Button>
      </form>
    </div>
  );
}
