"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function HeaderNav() {
  return <HeaderLinks path={usePathname()} />;
}

export function HeaderLinks({ path }: { path?: string }) {
  const newOperation = path === "/operaciones/nueva";
  const operation = !newOperation && !!path?.startsWith("/operaciones/");
  return (
    <nav aria-label="Principal" className="-mr-2 flex items-center gap-0.5 sm:-mr-3 sm:gap-1">
      <Link href="/#operaciones" aria-current={operation ? "true" : undefined} className="nav-item px-2 sm:px-3">
        Operaciones
      </Link>
      <Link href="/operaciones/nueva" aria-current={newOperation ? "page" : undefined} className="nav-item px-2 sm:px-3">
        Nueva operación
      </Link>
    </nav>
  );
}
