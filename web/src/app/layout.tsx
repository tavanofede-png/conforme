import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/chivo-mono/wght.css";
import { LogoMark } from "@/components/Logo";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conforme · Revisión de documentos de embarque",
  description:
    "Revisa la factura comercial, el packing list y el conocimiento de embarque contra la orden de compra y libera el pago protegido cuando los documentos están conformes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className="h-full">
      <body className="flex min-h-full flex-col">
        <a
          href="#contenido"
          className="sr-only rounded-md bg-ink px-3 py-2 text-sm text-canvas focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          Ir al contenido
        </a>
        <header className="border-b border-line">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
            <Link href="/" className="flex items-center gap-2 rounded-sm">
              <LogoMark className="h-[22px] w-auto" />
              <span className="text-[17px] font-semibold tracking-[-0.01em] font-stretch-[112%]">Conforme</span>
            </Link>
            <nav aria-label="Principal" className="flex items-center gap-4 text-sm text-ink-2 sm:gap-6">
              <Link href="/#operaciones" className="hover:text-ink">
                Operaciones
              </Link>
              <Link href="/operaciones/nueva" className="hover:text-ink">
                Nueva operación
              </Link>
            </nav>
          </div>
        </header>
        <main id="contenido" className="flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
