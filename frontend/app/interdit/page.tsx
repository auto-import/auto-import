import Link from "next/link";
import { ShieldX } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <section className="card max-w-md p-8 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-status-red-text" />
        <h1 className="mt-4 text-2xl font-semibold">Accès interdit</h1>
        <p className="mt-2 text-sm text-muted">
          Votre compte ne possède pas la permission nécessaire pour ouvrir cette
          page.
        </p>
        <Link href="/" className="btn-primary mt-6 inline-flex">
          Retour au tableau de bord
        </Link>
      </section>
    </main>
  );
}
