"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  Ellipsis,
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
import { IconTile, Modal, type Tone } from "./ui";

type NavLink = { href: string; label: string; short?: string; icon: LucideIcon; tone: Tone };
const GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: "Lavoro",
    links: [
      { href: "/chiamate", label: "Chiamate", icon: Phone, tone: "green" },
      { href: "/crm", label: "CRM", icon: Users, tone: "blue" },
      { href: "/ricerca", label: "Ricerca lead", short: "Ricerca", icon: Search, tone: "purple" },
    ],
  },
  {
    title: "Contenuti",
    links: [
      { href: "/script", label: "Script", icon: FileText, tone: "orange" },
      { href: "/materiali", label: "Materiali", icon: Paperclip, tone: "pink" },
    ],
  },
  {
    title: "Configurazione",
    links: [
      { href: "/impostazioni", label: "Impostazioni", icon: Settings, tone: "gray" },
      { href: "/test-audio", label: "Prova audio", icon: Mic, tone: "red" },
    ],
  },
];
const ALL = GROUPS.flatMap((g) => g.links);
// barra in basso su iPhone: 4 voci principali + "Altro"
const TABS = ALL.filter((l) => ["/chiamate", "/crm", "/ricerca", "/script"].includes(l.href));
const MORE = ALL.filter((l) => !TABS.includes(l));

function Logo() {
  return (
    <Link href="/chiamate" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-gradient-to-b from-[#3ddc6a] to-[#28b44c] text-white shadow-sm">
        <Phone size={16} strokeWidth={2.5} fill="currentColor" />
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-[#1d1d1f]">Cold Call</span>
    </Link>
  );
}

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [path]);

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
  }
  const active = (href: string) => path.startsWith(href);

  return (
    <>
      {/* IPHONE: barra in alto in vetro */}
      <header data-app-nav className="glass sticky top-0 z-40 border-b border-black/[0.06] md:hidden">
        <div className="flex h-12 items-center justify-center px-4">
          <Logo />
        </div>
      </header>

      {/* IPHONE: barra in basso con le schede, come le app Apple */}
      <nav
        data-app-nav
        className="glass fixed inset-x-0 bottom-0 z-40 border-t border-black/[0.06] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-5">
          {TABS.map(({ href, label, short, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className={`flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium transition-colors ${
                  active(href) ? "text-[#007aff]" : "text-[#8e8e93]"
                }`}
              >
                <Icon size={24} strokeWidth={active(href) ? 2.2 : 1.8} />
                {short ?? label}
              </Link>
            </li>
          ))}
          <li>
            <button
              onClick={() => setMoreOpen(true)}
              className={`flex w-full flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium ${
                MORE.some((l) => active(l.href)) ? "text-[#007aff]" : "text-[#8e8e93]"
              }`}
            >
              <Ellipsis size={24} strokeWidth={1.8} />
              Altro
            </button>
          </li>
        </ul>
      </nav>
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Altro">
        <div className="overflow-hidden rounded-2xl bg-[#767680]/[0.06]">
          {[...MORE, { href: "/privacy", label: "Privacy", icon: Shield, tone: "gray" as Tone }].map(
            ({ href, label, icon, tone }, i, arr) => (
              <div key={href}>
                <Link href={href} className="flex items-center gap-3 px-4 py-3 active:bg-black/5">
                  <IconTile icon={icon} tone={tone} size="sm" />
                  <span className="flex-1 text-[17px] text-[#1d1d1f]">{label}</span>
                  <ChevronRight size={18} className="text-slate-300" />
                </Link>
                {i < arr.length - 1 && <div className="ml-14 h-px bg-black/[0.06]" />}
              </div>
            ),
          )}
        </div>
        <button onClick={logout} className="mt-4 w-full rounded-2xl bg-[#767680]/[0.06] py-3 text-[17px] text-[#ff3b30] active:bg-black/5">
          Esci
        </button>
      </Modal>

      {/* MAC: barra laterale chiara in vetro, come Finder/Impostazioni */}
      <nav
        data-app-nav
        className="glass sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-black/[0.06] md:flex"
      >
        <div className="px-5 pb-4 pt-6">
          <Logo />
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-3 py-1">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8e8e93]">{g.title}</div>
              <ul className="space-y-0.5">
                {g.links.map(({ href, label, icon, tone }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`flex items-center gap-3 rounded-[10px] px-2.5 py-[7px] text-[14px] transition-all duration-200 ${
                        active(href)
                          ? "bg-white font-semibold text-[#1d1d1f] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_-4px_rgba(0,0,0,0.08)]"
                          : "font-medium text-[#3c3c43] hover:bg-black/[0.04]"
                      }`}
                    >
                      <IconTile icon={icon} tone={tone} size="sm" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="space-y-0.5 border-t border-black/[0.06] p-3">
          <Link
            href="/privacy"
            className="flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-[14px] text-[#3c3c43] hover:bg-black/[0.04]"
          >
            <Shield size={16} className="ml-1.5 text-[#8e8e93]" /> Privacy
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-[14px] text-[#3c3c43] hover:bg-black/[0.04]"
          >
            <LogOut size={16} className="ml-1.5 text-[#8e8e93]" /> Esci
          </button>
        </div>
      </nav>
    </>
  );
}
