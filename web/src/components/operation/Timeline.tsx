import type { Operation } from "@/lib/domain";
import { operationSteps, type StepState } from "@/lib/status";

const BAR: Record<StepState, string> = {
  done: "bg-ink",
  current: "bg-ink/30",
  blocked: "bg-bad",
  todo: "bg-line",
};

const SR_STATE: Record<StepState, string> = {
  done: "completa",
  current: "en curso",
  blocked: "detenida",
  todo: "pendiente",
};

export function Timeline({ op }: { op: Operation }) {
  const steps = operationSteps(op);
  return (
    <ol className="mt-8 grid grid-cols-5 gap-1.5 sm:gap-3" aria-label="Etapas de la operación">
      {steps.map((s) => (
        <li key={s.key} aria-current={s.state === "current" ? "step" : undefined}>
          <span className={`block h-[3px] rounded-full ${BAR[s.state]}`} aria-hidden />
          <span className={`mt-2.5 block text-[11px] leading-tight font-medium sm:text-sm ${s.state === "todo" ? "text-muted" : ""}`}>
            {s.label}
            <span className="sr-only"> ({SR_STATE[s.state]})</span>
          </span>
          <span className={`mt-0.5 block text-[10px] leading-tight sm:text-xs ${s.state === "blocked" ? "text-bad" : "text-muted"}`}>
            {s.detail}
          </span>
        </li>
      ))}
    </ol>
  );
}
