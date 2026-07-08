import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { FacturaForm } from "@/components/facturas/FacturaForm";

export default async function NouvellePage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Nouvelle Facture</h1>
          <p className="text-sm text-gray-500 mt-1">Remplissez les informations de la facture et sélectionnez les approbateurs</p>
        </div>
        <FacturaForm mode="create" />
      </div>
    </div>
  );
}
