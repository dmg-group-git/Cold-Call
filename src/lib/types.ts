export type LeadStatus =
  | "nuovo"
  | "contattato"
  | "ha_risposto"
  | "demo"
  | "in_prova"
  | "cliente"
  | "perso";

export const STATUSES: { value: LeadStatus; label: string; color: string }[] = [
  { value: "nuovo", label: "Nuovo", color: "bg-slate-100 text-slate-700" },
  { value: "contattato", label: "Contattato", color: "bg-blue-100 text-blue-700" },
  { value: "ha_risposto", label: "Ha risposto", color: "bg-indigo-100 text-indigo-700" },
  { value: "demo", label: "Demo", color: "bg-amber-100 text-amber-800" },
  { value: "in_prova", label: "In prova", color: "bg-purple-100 text-purple-700" },
  { value: "cliente", label: "Cliente", color: "bg-green-100 text-green-700" },
  { value: "perso", label: "Perso", color: "bg-red-100 text-red-700" },
];

export type Outcome = "non_risponde" | "da_richiamare" | "interessato" | "non_interessato";

export const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: "non_risponde", label: "Non risponde" },
  { value: "da_richiamare", label: "Da richiamare" },
  { value: "interessato", label: "Interessato" },
  { value: "non_interessato", label: "Non interessato (no)" },
];

export interface Lead {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  category: string | null;
  place_id: string | null;
  rating: number | null;
  reviews_count: number | null;
  status: LeadStatus;
  next_action_at: string | null;
  notes: string | null;
}

export interface Interaction {
  id: string;
  created_at: string;
  lead_id: string;
  type: "call" | "whatsapp" | "note" | "event";
  outcome: Outcome | null;
  summary: string | null;
  objections: string[] | null;
  next_step: string | null;
  transcript: string | null;
  recording_path: string | null;
  recording_deleted: boolean;
  duration_sec: number | null;
  analysis_status: string | null;
  data: Record<string, unknown> | null;
}

export interface Script {
  id: string;
  kind: "call" | "wa_no_answer" | "wa_answered";
  title: string;
  body: string;
  updated_at: string;
}

export interface Material {
  id: string;
  created_at: string;
  title: string;
  kind: "pdf" | "video" | "link";
  url: string;
  storage_path: string | null;
}

export interface Settings {
  id: number;
  company_name: string;
  company_website: string;
  company_contacts: string;
  sender_name: string;
  audio_device_id: string | null;
  audio_device_label: string | null;
  meeting_minutes: number;
  calendar_id: string;
  google_email: string | null;
}

export interface Analysis {
  esito: Outcome;
  riassunto: string;
  obiezioni: string[];
  prossimo_passo: string;
  tipo_appuntamento: "videocall" | "richiamata" | "nessuno";
  data_appuntamento: string | null; // "YYYY-MM-DDTHH:mm" ora italiana
  nome_referente: string | null;
  email_lead: string | null;
}
