import { Phone, Smartphone } from "lucide-react";
import { phoneKind } from "@/lib/utils";

/** Etichetta "cellulare" (si può usare WhatsApp) o "fisso". */
export function PhoneKind({ phone }: { phone: string | null | undefined }) {
  const kind = phoneKind(phone);
  if (!kind) return null;
  return kind === "cellulare" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
      <Smartphone size={11} /> cellulare
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      <Phone size={11} /> fisso
    </span>
  );
}
