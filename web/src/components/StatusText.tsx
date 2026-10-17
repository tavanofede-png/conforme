import type { Tone } from "@/lib/status";

const DOT: Record<Tone, string> = {
  ok: "bg-ink",
  bad: "bg-bad",
  neutral: "border border-muted",
};

export function StatusText({ tone, children, className = "" }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-sm whitespace-nowrap ${tone === "bad" ? "text-bad" : "text-ink-2"} ${className}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden />
      {children}
    </span>
  );
}
