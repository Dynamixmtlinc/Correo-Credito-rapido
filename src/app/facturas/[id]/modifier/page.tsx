import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/AppHeader";
import { FacturaForm } from "@/components/facturas/FacturaForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ModifierPage({ params }: Props) {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  const { id } = await params;
  const factura = await prisma.factura.findUnique({
    where: { id },
    include: { ecole: true, fournisseur: true },
  });

  if (!factura) notFound();

  // Solo el responsable puede editar
  if (factura.responsableEmail.toLowerCase() !== session.user?.email?.toLowerCase()) {
    redirect("/");
  }

  const defaultValues = {
    nombreFactura: factura.nombreFactura,
    noProjet: factura.noProjet,
    srmProjet: factura.srmProjet ?? undefined,
    ecoleId: factura.ecoleId,
    fournisseurId: factura.fournisseurId,
    montant: Number(factura.montant),
    dateFacture: factura.dateFacture.toISOString().split("T")[0],
    dateSaisie: factura.dateSaisie.toISOString().split("T")[0],
    dateLimite: factura.dateLimite?.toISOString().split("T")[0] ?? undefined,
    indiceComptable: factura.indiceComptable ?? undefined,
    affectationCredit: factura.affectationCredit ?? undefined,
    commentairesResponsable: factura.commentairesResponsable ?? undefined,
    repartitionRequise: factura.repartitionRequise,
    raisonSocialConforme: factura.raisonSocialConforme,
    dixPourcentVerifier: factura.dixPourcentVerifier,
    fourHomologue: factura.fourHomologue,
    paimentRapide: factura.paimentRapide,
    affectationCreditCheck: factura.affectationCreditCheck,
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Modifier la Facture</h1>
          <p className="text-sm text-gray-500 mt-1">{factura.nombreFactura}</p>
        </div>
        <FacturaForm mode="edit" facturaId={id} defaultValues={defaultValues} />
      </div>
    </div>
  );
}
