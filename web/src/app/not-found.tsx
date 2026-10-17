import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">No encontramos esta página</h1>
      <p className="mt-3 max-w-md text-ink-2">El enlace puede estar incompleto o la operación ya no existe en este equipo.</p>
      <Link href="/#operaciones" className="link mt-6 inline-block text-sm">
        Ver las operaciones
      </Link>
    </div>
  );
}
