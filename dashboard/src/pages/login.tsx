import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setAdminToken } from "@/lib/auth";
import { checkAdminAuth } from "@/lib/api";

export function LoginPage() {
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (token.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    setAdminToken(token.trim());
    try {
      await checkAdminAuth();
      window.location.assign("/dashboard/keys");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-lg bg-blue-600">
            <KeyRound className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">
            Devin Proxy Gateway
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Sign in with your <code className="font-mono">ADMIN_API_KEY</code>.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-xl border border-[#1e2d3d] bg-[#111827] p-6 shadow-xl"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="token"
              className="block text-xs font-medium text-slate-400"
            >
              Admin token
            </label>
            <div className="relative">
              <Input
                id="token"
                type={show ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Bearer token configured via ADMIN_API_KEY"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="pr-9 font-mono"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide token" : "Show token"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-300"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting || token.trim().length === 0}
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>

          <p className="text-center text-[11px] text-slate-600">
            Token is held in <code>sessionStorage</code> for this tab only.
          </p>
        </form>
      </div>
    </div>
  );
}
