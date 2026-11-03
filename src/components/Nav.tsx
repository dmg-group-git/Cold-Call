"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/chiamate", label: "📞 Chiamate" },
  { href: "/crm", label: "🗂️ CRM" },
  { href: "/ricerca", label: "🔎 Ricerca lead" },
  { href: "/script", label: "📝 Script" },
  { href: "/materiali", label: "📎 Materiali" },
  { href: "/impostazioni", label: "⚙️ Impostazioni" },
  { href: "/test-audio", label: "🎙️ Prova audio" },
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
  }
  return (
    <nav className="border-b border-slate-200 bg-white md:min-h-screen md:w-56 md:border-b-0 md:border-r">
      <div className="p-4 text-lg font-semibold">Cold Call</div>
      <ul className="flex gap-1 overflow-x-auto px-2 pb-2 md:block md:space-y-1">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
                path.startsWith(l.href) ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden p-4 text-xs md:block">
        <button onClick={logout} className="text-slate-500 hover:text-slate-900">
          Esci
        </button>
        <span className="mx-2 text-slate-300">·</span>
        <Link href="/privacy" className="text-slate-500 hover:text-slate-900">
          Privacy
        </Link>
      </div>
    </nav>
  );
}
