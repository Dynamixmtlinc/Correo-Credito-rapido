"use client";

import { useState, useId } from "react";
import { useForm, type UseFormRegister, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Loader2, Save, X, Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUpload, FileItem } from "@/components/shared/FileUpload";
import { UserSearchCombo } from "@/components/shared/UserSearchCombo";
import type { CrearFacturaPayload } from "@/types";

const schema = z.object({
  nombreFactura: z.string().min(1, "Requis"),
  noProjet: z.string().min(1, "Requis"),
  srmProjet: z.string().optional(),
  ecoleId: z.string().min(1, "Requis"),
  fournisseurId: z.string().min(1, "Requis"),
  montant: z.coerce.number().positive("Doit être positif"),
  dateFacture: z.string().min(1, "Requis"),
  dateSaisie: z.string().optional(),
  dateLimite: z.string().optional(),
  indiceComptable: z.string().optional(),
  affectationCredit: z.string().optional(),
  commentairesResponsable: z.string().optional(),
  repartitionRequise: z.boolean().default(false),
  raisonSocialConforme: z.boolean().default(false),
  dixPourcentVerifier: z.boolean().default(false),
  fourHomologue: z.boolean().default(false),
  paimentRapide: z.boolean().default(false),
  affectationCreditCheck: z.boolean().default(false),
});

type FormData = z.infer<typeof schema>;

interface FacturaFormProps {
  defaultValues?: Partial<FormData>;
  facturaId?: string;
  mode: "create" | "edit";
}

export function FacturaForm({ defaultValues, facturaId, mode }: FacturaFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const solicitudId = useId().replace(/:/g, "");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      dateFacture: new Date().toISOString().split("T")[0],
      dateSaisie: new Date().toISOString().split("T")[0],
      ...defaultValues,
    },
  });

  const paimentRapide = watch("paimentRapide");
  const affectationCreditCheck = watch("affectationCreditCheck");

  const [file, setFile] = useState<File | null>(null);
  const [aprobadores, setAprobadores] = useState<Record<string, { email: string; nombre: string } | null>>({
    cp: null, regisseur: null, coordo: null, dirAdjointe: null, directionGenerale: null, coo: null,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: escuelas = [] } = useQuery({
    queryKey: ["escuelas"],
    queryFn: () => fetch("/api/escuelas").then((r) => r.json()),
  });

  const { data: proveedores = [] } = useQuery({
    queryKey: ["proveedores"],
    queryFn: () => fetch("/api/proveedores").then((r) => r.json()),
  });

  async function onSubmit(data: FormData) {
    if (mode === "create" && !file) {
      setSubmitError("Le fichier de facture est requis");
      return;
    }
    setSubmitError(null);

    const payload: CrearFacturaPayload = {
      ...data,
      cpEmail: aprobadores.cp?.email,
      cpNombre: aprobadores.cp?.nombre,
      regisseurEmail: aprobadores.regisseur?.email,
      regisseurNombre: aprobadores.regisseur?.nombre,
      coordoEmail: aprobadores.coordo?.email,
      coordoNombre: aprobadores.coordo?.nombre,
      dirAdjointeEmail: aprobadores.dirAdjointe?.email,
      dirAdjointeNombre: aprobadores.dirAdjointe?.nombre,
      directionGeneraleEmail: aprobadores.directionGenerale?.email,
      directionGeneraleNombre: aprobadores.directionGenerale?.nombre,
      cooEmail: aprobadores.coo?.email,
      cooNombre: aprobadores.coo?.nombre,
      idSolicitudTemporal: solicitudId,
    };

    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    if (file) formData.append("file", file);

    const url = mode === "create" ? "/api/facturas" : `/api/facturas/${facturaId}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const res = await fetch(url, { method, body: mode === "create" ? formData : JSON.stringify(payload) });

    if (!res.ok) {
      const err = await res.json();
      setSubmitError(err.error ?? "Erreur lors de l'enregistrement");
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["facturas"] });
    if (facturaId) queryClient.invalidateQueries({ queryKey: ["factura", facturaId] });
    router.push("/");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Sección 1: Identification */}
      <FormSection title="Identification">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="No. Facture *" error={errors.nombreFactura?.message}>
            <input {...register("nombreFactura")} className={inputClass} placeholder="FAC-2024-001" />
          </FormField>
          <FormField label="No. Projet *" error={errors.noProjet?.message}>
            <input {...register("noProjet")} className={inputClass} placeholder="PRJ-2024-xxx" />
          </FormField>
          <FormField label="SRM Projet" error={errors.srmProjet?.message}>
            <input {...register("srmProjet")} className={inputClass} placeholder="SRM-xxx" />
          </FormField>
          <FormField label="Indice Comptable" error={errors.indiceComptable?.message}>
            <input {...register("indiceComptable")} className={inputClass} />
          </FormField>
        </div>
      </FormSection>

      {/* Sección 2: École + Fournisseur */}
      <FormSection title="École et Fournisseur">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="École *" error={errors.ecoleId?.message}>
            <select {...register("ecoleId")} className={inputClass}>
              <option value="">Sélectionner une école...</option>
              {escuelas.map((e: { id: string; nombre: string }) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Fournisseur *" error={errors.fournisseurId?.message}>
            <select {...register("fournisseurId")} className={inputClass}>
              <option value="">Sélectionner un fournisseur...</option>
              {proveedores.map((p: { id: string; nombre: string }) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </FormField>
        </div>
      </FormSection>

      {/* Sección 3: Données financières */}
      <FormSection title="Données financières">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Montant (CAD) *" error={errors.montant?.message}>
            <input {...register("montant")} type="number" step="0.01" min="0" className={inputClass} placeholder="0.00" />
          </FormField>
          <FormField label="Date de Facture *" error={errors.dateFacture?.message}>
            <input {...register("dateFacture")} type="date" className={inputClass} />
          </FormField>
          <FormField label="Date de Saisie" error={errors.dateSaisie?.message}>
            <input {...register("dateSaisie")} type="date" className={inputClass} />
          </FormField>
        </div>
      </FormSection>

      {/* Sección 4: Vérifications */}
      <FormSection title="Vérifications">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <CheckboxField label="Répartition S9 requise" name="repartitionRequise" register={register as unknown as UseFormRegister<FieldValues>} />
          <CheckboxField label="Raison sociale conforme" name="raisonSocialConforme" register={register as unknown as UseFormRegister<FieldValues>} />
          <CheckboxField label="10% à vérifier" name="dixPourcentVerifier" register={register as unknown as UseFormRegister<FieldValues>} />
          <CheckboxField label="Fournisseur homologué" name="fourHomologue" register={register as unknown as UseFormRegister<FieldValues>} />
          <CheckboxField label="Paiement rapide" name="paimentRapide" register={register as unknown as UseFormRegister<FieldValues>} />
          <CheckboxField label="Affectation de crédit" name="affectationCreditCheck" register={register as unknown as UseFormRegister<FieldValues>} />
        </div>

        {paimentRapide && (
          <FormField label="Date limite (paiement rapide)" error={errors.dateLimite?.message} className="mt-3 max-w-xs">
            <input {...register("dateLimite")} type="date" className={inputClass} />
          </FormField>
        )}
        {affectationCreditCheck && (
          <FormField label="Affectation de crédit — détails" error={errors.affectationCredit?.message} className="mt-3">
            <input {...register("affectationCredit")} className={inputClass} placeholder="Code ou description de l'affectation" />
          </FormField>
        )}
      </FormSection>

      {/* Sección 5: Approbateurs */}
      <FormSection title="Approbateurs">
        <div className="space-y-3">
          {ROLES_APROBADORES.map(({ key, label }) => (
            <div key={key}>
              <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
              <UserSearchCombo
                value={aprobadores[key]}
                onChange={(u) => setAprobadores((prev) => ({ ...prev, [key]: u }))}
                placeholder={`Rechercher ${label.toLowerCase()}...`}
              />
            </div>
          ))}
        </div>
      </FormSection>

      {/* Sección 6: Commentaires */}
      <FormSection title="Commentaires">
        <textarea
          {...register("commentairesResponsable")}
          rows={3}
          className={`${inputClass} resize-none`}
          placeholder="Informations complémentaires..."
        />
      </FormSection>

      {/* Sección 7: Fichier (solo en creación) */}
      {mode === "create" && (
        <FormSection title="Fichier de facture *">
          {file ? (
            <FileItem
              file={{ nombre: file.name, tamano: file.size, contentType: file.type }}
              onRemove={() => setFile(null)}
            />
          ) : (
            <FileUpload
              onFile={setFile}
              accept="application/pdf,image/jpeg,image/png,image/tiff"
              label="Glissez-déposez le fichier PDF ou image de la facture"
            />
          )}
        </FormSection>
      )}

      {/* Errores y botones */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700">{submitError}</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2 border-t">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 px-6 py-2 text-sm font-medium bg-csdm-blue hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-60"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {mode === "create" ? "Enregistrer la facture" : "Sauvegarder les modifications"}
        </button>
      </div>
    </form>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const inputClass =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-csdm-blue focus:border-transparent bg-white";

const ROLES_APROBADORES = [
  { key: "cp", label: "CP (Chef de Projet)" },
  { key: "regisseur", label: "Régisseur" },
  { key: "coordo", label: "Coordinateur" },
  { key: "dirAdjointe", label: "Directeur Adjoint" },
  { key: "directionGenerale", label: "Direction Générale" },
  { key: "coo", label: "COO" },
];

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">{title}</h3>
      {children}
    </div>
  );
}

function FormField({
  label, error, children, className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-gray-600 mb-1 block">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

function CheckboxField({ label, name, register }: { label: string; name: string; register: UseFormRegister<FieldValues> }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="checkbox"
        {...(register as (name: string) => object)(name)}
        className="w-4 h-4 text-csdm-blue border-gray-300 rounded focus:ring-csdm-blue"
      />
      <span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
    </label>
  );
}
