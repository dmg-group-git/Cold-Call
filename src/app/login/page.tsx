"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Phone } from "lucide-react";
import { Alert, btnLg, btnPrimary, input, label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError("Email o password non corretti");
    router.replace("/chiamate");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-brand-600/30 blur-3xl" />
      <form
        onSubmit={submit}
        className="animate-pop-in relative w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-2xl"
      >
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
            <Phone size={22} strokeWidth={2.5} />
          </span>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Cold Call Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Accedi per iniziare a chiamare</p>
        </div>
        <div>
          <label className={label}>Email</label>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className={label}>Password</label>
          <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <button className={`${btnPrimary} ${btnLg} w-full`} disabled={busy}>
          {busy ? "Accesso…" : "Entra"}
        </button>
      </form>
    </main>
  );
}
