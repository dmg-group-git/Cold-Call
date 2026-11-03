export function LevelMeter({ level }: { level: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className={`h-full transition-all ${level > 0.85 ? "bg-red-500" : "bg-green-500"}`}
        style={{ width: `${Math.round(level * 100)}%` }}
      />
    </div>
  );
}
