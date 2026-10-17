/** Una hoja con el signo igual: los documentos tienen que coincidir con la orden de compra. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 24" className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M2 0h11l7 7v15a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2Zm3 11v2h10v-2Zm0 5v2h10v-2Z"
      />
    </svg>
  );
}
