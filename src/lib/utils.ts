import type { Lead, Material, Settings } from "./types";

/** Porta un numero in formato +39XXXXXXXX. Ritorna null se vuoto. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) s = "+39" + s;
  return s;
}

/** Numero per wa.me (solo cifre, con prefisso). */
export function waNumber(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
}

export function telLink(phone: string): string {
  return `tel:${phone.replace(/\s/g, "")}`;
}

/** Sostituisce {variabili} nel testo. */
export function fillTemplate(
  body: string,
  lead: Partial<Lead> | null,
  settings: Partial<Settings> | null,
  extra: Record<string, string> = {},
): string {
  const vars: Record<string, string> = {
    nome: lead?.contact_person || lead?.name || "",
    struttura: lead?.name || "",
    città: lead?.city || "",
    citta: lead?.city || "",
    mio_nome: settings?.sender_name || "",
    azienda: settings?.company_name || "",
    sito: settings?.company_website || "",
    riferimenti: settings?.company_contacts || "",
    materiali: "",
    ...extra,
  };
  return body.replace(/\{([a-zà_]+)\}/gi, (m, key: string) =>
    key.toLowerCase() in vars ? vars[key.toLowerCase()] : m,
  );
}

export function materialsText(materials: Material[]): string {
  return materials.map((m) => `• ${m.title}: ${m.url}`).join("\n");
}

/** Se il testo non contiene {materiali}, aggiunge i link dei materiali in fondo. */
export function withMaterials(filled: string, body: string, materials: Material[]): string {
  if (!materials.length || /\{materiali\}/i.test(body)) return filled;
  return `${filled.trimEnd()}\n\n${materialsText(materials)}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(sec: number | null | undefined): string {
  if (!sec && sec !== 0) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Converte "YYYY-MM-DDTHH:mm" (ora di Roma) in ISO UTC. */
export function romeLocalToIso(local: string): string {
  // calcola lo scarto di Roma per quella data
  const asUtc = new Date(local + ":00Z");
  const romeStr = asUtc.toLocaleString("sv-SE", { timeZone: "Europe/Rome" }).replace(" ", "T");
  const diff = new Date(romeStr + "Z").getTime() - asUtc.getTime();
  return new Date(asUtc.getTime() - diff).toISOString();
}

/** "YYYY-MM-DDTHH:mm" di adesso + giorni, ora di Roma. */
export function romeLocalNow(addMinutes = 0): string {
  const d = new Date(Date.now() + addMinutes * 60000);
  return d.toLocaleString("sv-SE", { timeZone: "Europe/Rome" }).replace(" ", "T").slice(0, 16);
}

export function addMinutesLocal(local: string, minutes: number): string {
  const d = new Date(local + ":00Z");
  return new Date(d.getTime() + minutes * 60000).toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm" -> "12/11/2026 alle 15:00" */
export function prettyLocal(local: string): string {
  const [d, t] = local.split("T");
  return `${d.split("-").reverse().join("/")} alle ${t?.slice(0, 5) ?? ""}`;
}

/** Apre il link tel: senza lasciare la pagina (sul Mac parte FaceTime -> iPhone). */
export function openTel(phone: string) {
  const a = document.createElement("a");
  a.href = telLink(phone);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
