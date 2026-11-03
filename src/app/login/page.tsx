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
    <main className="relative flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="animate-pop-in relative w-full max-w-sm space-y-5 rounded-[28px] bg-white/80 p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.2)] ring-1 ring-black/[0.04] backdrop-blur-xl"
      >
        <div className="flex flex-col items-center text-center">
          <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-[18px] bg-gradient-to-b from-[#3ddc6a] to-[#28b44c] text-white shadow-lg shadow-green-500/30">
            <Phone size={30} strokeWidth={2} fill="currentColor" />
          </span>
          <h1 className="text-[28px] font-bold tracking-tight text-[#1d1d1f]">Cold Call</h1>
          <p className="mt-1 text-[15px] text-slate-500">Accedi per iniziare a chiamare</p>
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
