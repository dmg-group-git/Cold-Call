"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FileText,
  LogOut,
  Mic,
  Paperclip,
  Phone,
  Search,
  Settings,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const GROUPS: { title: string; links: { href: string; label: string; icon: LucideIcon }[] }[] = [
  {
    title: "Lavoro",
    links: [
      { href: "/chiamate", label: "Chiamate", icon: Phone },
      { href: "/crm", label: "CRM", icon: Users },
      { href: "/ricerca", label: "Ricerca lead", icon: Search },
    ],
  },
  {
    title: "Contenuti",
    links: [
      { href: "/script", label: "Script", icon: FileText },
      { href: "/materiali", label: "Materiali", icon: Paperclip },
    ],
  },
  {
    title: "Configurazione",
    links: [
      { href: "/impostazioni", label: "Impostazioni", icon: Settings },
      { href: "/test-audio", label: "Prova audio", icon: Mic },
    ],
  },
];

function Logo() {
  return (
    <Link href="/chiamate" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-900/30">
        <Phone size={16} strokeWidth={2.5} />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Cold Call</span>
    </Link>
  );
}

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
  }
  const active = (href: string) => path.startsWith(href);

  return (
    <>
      {/* MOBILE: barra in alto con menu scorrevole */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur md:hidden">
        <div className="flex items-center justify-between px-4 py-3 text-slate-900">
          <Logo />
          <button onClick={logout} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Esci">
            <LogOut size={18} />
          </button>
        </div>
        <ul className="flex gap-1 overflow-x-auto px-3 pb-2">
          {GROUPS.flatMap((g) => g.links).map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                  active(href) ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon size={15} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </header>

      {/* DESKTOP: barra laterale scura */}
      <nav className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-slate-950 text-slate-300 md:flex">
        <div className="px-5 py-5 text-white">
          <Logo />
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.title}</div>
              <ul className="space-y-0.5">
                {g.links.map(({ href, label, icon: Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        active(href)
                          ? "bg-white/10 text-white"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <Icon
                        size={17}
                        className={active(href) ? "text-brand-400" : "text-slate-500 group-hover:text-slate-300"}
                      />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="space-y-0.5 border-t border-white/10 p-3">
          <Link
            href="/privacy"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <Shield size={17} className="text-slate-500" /> Privacy
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <LogOut size={17} className="text-slate-500" /> Esci
          </button>
        </div>
      </nav>
    </>
  );
}
