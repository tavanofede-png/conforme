"use client";

import { useState } from "react";

function Copy({ href, label }: { href: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        const url = new URL(href, window.location.origin).toString();
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copiado" : label}
    </button>
  );
}

export function ShareLinks({ supplierToken, reportToken }: { supplierToken?: string; reportToken?: string }) {
  if (!supplierToken || !reportToken) return null;
  return (
    <section className="mt-8" aria-labelledby="compartir">
      <h2 id="compartir" className="text-[15px] font-medium">
        Compartir
      </h2>
      <p className="mt-1 max-w-xl text-sm text-muted">
        El proveedor puede subir documentos y ver por qué el pago sigue protegido. El informe es de solo lectura.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Copy href={`/proveedor/${supplierToken}`} label="Copiar enlace del proveedor" />
        <Copy href={`/informe/${reportToken}`} label="Copiar informe" />
      </div>
    </section>
  );
}
