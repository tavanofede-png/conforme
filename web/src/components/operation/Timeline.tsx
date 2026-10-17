import type { Operation } from "@/lib/domain";
import { operationSteps, type StepState } from "@/lib/status";

const BAR: Record<StepState, string> = {
  done: "bg-ink/75",
  current: "bg-ink/35",
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
  const active = steps.find((s) => s.state === "current" || s.state === "blocked") ?? steps[steps.length - 1];
  return (
    <div className="mt-8">
      <ol className="grid grid-cols-5 gap-1.5 sm:gap-3" aria-label="Etapas de la operación">
        {steps.map((s) => (
          <li key={s.key} aria-current={s.state === "current" ? "step" : undefined}>
            <span className="sr-only">
              {s.label}: {s.detail} ({SR_STATE[s.state]})
            </span>
            <span className={`block h-[3px] rounded-full ${BAR[s.state]}`} aria-hidden />
            <span aria-hidden className={`mt-2.5 hidden text-sm leading-tight font-medium sm:block ${s.state === "todo" ? "text-muted" : ""}`}>
              {s.label}
            </span>
            <span aria-hidden className={`mt-0.5 hidden text-xs leading-tight sm:block ${s.state === "blocked" ? "text-bad" : "text-muted"}`}>
              {s.detail}
            </span>
          </li>
        ))}
      </ol>
      <p aria-hidden className="mt-2.5 text-sm sm:hidden">
        <span className="font-medium">{active.label}</span>
        <span className={active.state === "blocked" ? "text-bad" : "text-muted"}> · {active.detail}</span>
        <span className="text-muted">
          {" "}
          · Etapa {steps.indexOf(active) + 1} de {steps.length}
        </span>
      </p>
    </div>
  );
}
