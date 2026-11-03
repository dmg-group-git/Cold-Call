import { Nav } from "@/components/Nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen md:flex">
      <Nav />
      {/* su iPhone lascia spazio per la barra in basso */}
      <main className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-10 md:pb-12 md:pt-12">
        <div className="animate-page mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
