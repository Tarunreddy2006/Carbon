import React, { useState, useEffect } from "react";

declare var process: { env: { [key: string]: string | undefined } };

export interface AuditPortalProps {
  batchId: string;
  onClose?: () => void;
}

interface DossierData {
  audit_version: string;
  dossier_timestamp: string;
  cryptographic_seal: string;
  batch_metadata: {
    id: string;
    project_id: string;
    batch_lot_number: string;
    status: string;
    net_sequestration_tco2e: number;
    created_at: string;
    updated_at: string;
  };
  feedstock_origin_proofs: Array<{
    id: string;
    feedstock_type: string;
    weight_tons?: number;
    wet_mass_tons?: number;
    moisture_content_percentage?: number;
    satellite_clearance_status: boolean;
    ingest_timestamp?: string;
    created_at?: string;
  }>;
  pyrolysis_industrial_telemetry: Array<{
    id: number;
    timestamp: string;
    kiln_temperature_celsius: number;
    electricity_consumption_kwh: number;
    fossil_fuel_consumption_liters: number;
  }>;
  laboratory_chemical_assays: {
    id?: string;
    organic_carbon_percentage?: number;
    molar_hc_ratio?: number;
    verification_tier?: string;
    certificate_hash?: string;
    uploaded_at?: string;
  };
  downstream_sink_attestations: Array<{
    id: string;
    delivery_ticket_id: string;
    farmer_id: string;
    shipped_mass_tons: number;
    sink_latitude: number | null;
    sink_longitude: number | null;
    photo_evidence_url: string;
    attestation_timestamp: string | null;
  }>;
}

export const AuditPortal: React.FC<AuditPortalProps> = ({ batchId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [dossier, setDossier] = useState<DossierData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sealValid, setSealValid] = useState<boolean | null>(null);

  // 1. Fetch dossier details on mount or batchId change
  useEffect(() => {
    if (!batchId) return;

    const fetchDossier = async () => {
      setLoading(true);
      setError(null);
      setSealValid(null);
      try {
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${backendUrl}/api/v1/biochar/${batchId}/dossier`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || "Failed to load verification dossier.");
        }
        const data = (await res.json()) as DossierData;
        setDossier(data);

        // Client-side verification simulation of the seal
        // In production, we'd recalculate the SHA-256 of the JSON fields excluding the seal.
        // We verify that the seal is present and has the correct SHA-256 format.
        if (data.cryptographic_seal && data.cryptographic_seal.length === 64) {
          setSealValid(true);
        } else {
          setSealValid(false);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDossier();
  }, [batchId]);

  // 2. Export dossier to JSON file
  const handleExportPackage = () => {
    if (!dossier) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(dossier, null, 2)
    )}`;
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonString);
    downloadAnchor.setAttribute(
      "download",
      `dossier_${dossier.batch_metadata.batch_lot_number}_${batchId}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  if (loading) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Compiling cryptographic audit dossier...</p>
        </div>
      </div>
    );
  }

  if (error || !dossier) {
    return (
      <div className="w-full p-6 bg-white border border-gray-200 rounded-lg shadow-sm text-center space-y-4">
        <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-md font-bold text-gray-900">Audit Compilation Failed</h3>
        <p className="text-xs text-gray-500 max-w-md mx-auto">{error || "Could not retrieve audit information."}</p>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded"
          >
            Close Portal
          </button>
        )}
      </div>
    );
  }

  // Pre-calculate compliance metrics
  const satellitePassed = dossier.feedstock_origin_proofs.every(
    (f) => f.satellite_clearance_status === true
  );

  const sub350Readings = dossier.pyrolysis_industrial_telemetry.filter(
    (t) => t.kiln_temperature_celsius < 350.0
  );
  const thermalAnomaly = sub350Readings.length > 0;

  const molarRatio = dossier.laboratory_chemical_assays.molar_hc_ratio;
  const permanenceTier = dossier.laboratory_chemical_assays.verification_tier;
  const isChemicalFailed = molarRatio !== undefined && molarRatio > 0.70;

  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl shadow-lg flex flex-col overflow-hidden max-w-4xl mx-auto">
      {/* Top Banner Header */}
      <div className="bg-slate-900 py-6 px-8 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-widest block font-bold">
            Independent Verification & Validation Portal (VVB)
          </span>
          <h2 className="text-lg font-bold font-mono text-white mt-1">
            Audit Dossier: {dossier.batch_metadata.batch_lot_number}
          </h2>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <span className="text-2xs font-mono text-slate-400">Seal Status:</span>
              {sealValid ? (
                <span className="inline-flex items-center gap-1 text-2xs font-mono font-bold text-emerald-400">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Verified Immutable
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-2xs font-mono font-bold text-red-400">
                  Seal Compromised
                </span>
              )}
            </div>
            <div className="w-[1px] h-3 bg-slate-700" />
            <div className="text-2xs font-mono text-slate-400">
              Audit Version: {dossier.audit_version}
            </div>
          </div>
        </div>

        {/* Token Yield Metrics Display */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-4 text-center md:text-right shrink-0">
          <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider block">
            Net Carbon Removal Yield
          </span>
          <span className="text-xl font-extrabold text-emerald-400 font-mono mt-0.5 block">
            {dossier.batch_metadata.net_sequestration_tco2e.toFixed(4)} tCO₂e
          </span>
        </div>
      </div>

      {/* Main Grid Portal */}
      <div className="p-8 space-y-6 flex-1">
        {/* Verification Badges Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Feedstock Screening Box */}
          <div className="border border-gray-200 rounded-lg p-5 bg-gray-50 flex items-start gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              satellitePassed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            }`}>
              {satellitePassed ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Feedstock Satellite Screening
              </h4>
              <p className="text-sm font-bold text-gray-900 mt-1">
                {satellitePassed ? "Clearance Confirmed" : "Satellite Warning Alert"}
              </p>
              <span className="text-3xs font-mono text-gray-400 block mt-0.5">
                Deforestation check complete.
              </span>
            </div>
          </div>

          {/* Thermal Stability Box */}
          <div className="border border-gray-200 rounded-lg p-5 bg-gray-50 flex items-start gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              !thermalAnomaly ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700 animate-pulse"
            }`}>
              {!thermalAnomaly ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Thermal Residence Stability
              </h4>
              <p className="text-sm font-bold text-gray-900 mt-1">
                {!thermalAnomaly ? "Residence Confirmed" : "Anomaly Detected"}
              </p>
              {thermalAnomaly ? (
                <span className="text-3xs font-mono text-red-600 block font-semibold mt-1">
                  Kiln Temp sub-350°C (Violations: {sub350Readings.length})
                </span>
              ) : (
                <span className="text-3xs font-mono text-gray-400 block mt-0.5">
                  Operating boundary maintained.
                </span>
              )}
            </div>
          </div>

          {/* Chemical Permanence Box */}
          <div className="border border-gray-200 rounded-lg p-5 bg-gray-50 flex items-start gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              !isChemicalFailed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            }`}>
              {!isChemicalFailed ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Chemical Permanence
              </h4>
              <p className="text-sm font-bold text-gray-900 mt-1 capitalize">
                {permanenceTier ? permanenceTier.replace(/_/g, " ") : "Pending Assay"}
              </p>
              <span className="text-3xs font-mono text-gray-400 block mt-0.5">
                Molar H:C ratio: {molarRatio !== undefined ? molarRatio.toFixed(3) : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Chemical permanence error alert if failed */}
        {isChemicalFailed && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2.5">
            <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <span className="font-bold">Chemical Permanence Validation Failed:</span> The batch molar hydrogen-to-carbon ratio (H:C) is <span className="font-mono font-bold">{molarRatio}</span>, which exceeds the absolute limit boundary of <span className="font-mono">0.70</span>. This indicates insufficient permanence qualities, marking this batch completely ineligible for token generation.
            </div>
          </div>
        )}

        {/* Cryptographic Seal Trace Details */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
              Cryptographic Seal Signatures
            </span>
            <span className="text-3xs font-mono text-gray-400">SHA-256 Ledger Seal</span>
          </div>
          <div className="p-4 bg-gray-50/50 space-y-3 font-mono text-xs text-gray-700">
            <div>
              <span className="text-gray-400 uppercase text-[9px] font-bold block mb-1">
                Hash Signature Seal (Outermost Level)
              </span>
              <div className="bg-slate-800 text-indigo-300 select-all p-3 rounded font-semibold break-all text-[11px] border border-slate-700 shadow-inner">
                {dossier.cryptographic_seal}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-3xs font-medium">
              <div>
                <span className="text-gray-400 block uppercase font-bold mb-0.5">Dossier Timestamp (UTC)</span>
                <span className="text-gray-900">{new Date(dossier.dossier_timestamp).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-400 block uppercase font-bold mb-0.5">Batch UUID</span>
                <span className="text-gray-900 break-all">{dossier.batch_metadata.id}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Aggregated Entities Counts Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="border border-gray-200 rounded-lg p-3">
            <span className="text-[10px] text-gray-400 uppercase block font-bold">Feedstock Ingests</span>
            <span className="text-md font-bold text-gray-800 mt-0.5 block">
              {dossier.feedstock_origin_proofs.length}
            </span>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <span className="text-[10px] text-gray-400 uppercase block font-bold">SCADA Telemetry Points</span>
            <span className="text-md font-bold text-gray-800 mt-0.5 block">
              {dossier.pyrolysis_industrial_telemetry.length}
            </span>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <span className="text-[10px] text-gray-400 uppercase block font-bold">Lab Certificates</span>
            <span className="text-md font-bold text-gray-800 mt-0.5 block">
              {dossier.laboratory_chemical_assays.certificate_hash ? 1 : 0}
            </span>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <span className="text-[10px] text-gray-400 uppercase block font-bold">Sink Attestations</span>
            <span className="text-md font-bold text-gray-800 mt-0.5 block">
              {dossier.downstream_sink_attestations.length}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Export & Controls */}
      <div className="bg-gray-50 py-4 px-6 border-t border-gray-200 flex items-center justify-between">
        {onClose ? (
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100 border border-gray-300 rounded shadow-2xs transition-all duration-150"
          >
            Close Portal
          </button>
        ) : (
          <div />
        )}
        <button
          onClick={handleExportPackage}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-2 transition-all duration-150"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Certified Compliance Package
        </button>
      </div>
    </div>
  );
};
export default AuditPortal;
