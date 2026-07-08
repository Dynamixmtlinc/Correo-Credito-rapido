"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-csdm-dark to-csdm-blue">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-full bg-csdm-blue flex items-center justify-center">
            <span className="text-white text-2xl font-bold">C</span>
          </div>
          <h1 className="text-2xl font-bold text-csdm-dark">
            Approbations de Factures
          </h1>
          <p className="text-sm text-gray-500 text-center">
            Commission scolaire de Montréal
          </p>
        </div>

        <button
          onClick={() => signIn("microsoft-entra-id", { callbackUrl })}
          className="w-full flex items-center justify-center gap-3 bg-[#0078d4] hover:bg-[#106ebe] text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
          </svg>
          Se connecter avec Microsoft 365
        </button>

        <p className="text-xs text-gray-400 text-center">
          Utilisez votre compte CSDM (@csdm.qc.ca)
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
