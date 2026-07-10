import React, { useState } from "react";
import { BatchStatus, BatchTimeline } from "./BatchTimeline";

export interface DistributionSinkData {
  delivery_ticket_id: string;
  farmer_id: string;
  shipped_mass_tons: number;
  attestation_timestamp: string | null;
}

export interface LabAssayData {
  organic_carbon_percentage: number | null;
  molar_hc_ratio: number | null;
  verification_tier: string | null;
  certificate_hash: string | null;
  uploaded_at: string | null;
}

export interface BatchData {
  id: string;
  batch_lot_number: string;
  feedstock_type: string;
  dry_mass_tons: number;
  molar_hc_ratio: number | null;
  net_sequestration_tco2e: number;
  status: BatchStatus;
  created_at: string;
  updated_at: string;
  lab_assay?: LabAssayData | null;
  distribution_sinks?: DistributionSinkData[] | null;
  project_name?: string | null;
  project_id?: string | null;
}

export interface BatchLedgerProps {
  batches: BatchData[];
  onBatchUpdated?: () => void;
}

export const BatchLedger: React.FC<BatchLedgerProps> = ({ batches }) => {
  const [selectedBatch, setSelectedBatch] = useState<BatchData | null>(null);

  const getStatusStyle = (status: BatchStatus) => {
    switch (status) {
      case "sourcing_purgatory":
        return "bg-gray-50 text-gray-700 border-gray-200";
      case "processing_active":
        return "bg-blue-50 text-blue-700 border-blue-200 animate-pulse";
      case "lab_certified":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "completed":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "ineligible":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const getFailedStage = (batch: BatchData): "sourcing" | "pyrolysis" | "lab" | "sinks" => {
    // Dynamically infer where it failed
    if (batch.status !== "ineligible") return "pyrolysis";
    if (!batch.lab_assay) return "lab";
    if (batch.molar_hc_ratio !== null && batch.molar_hc_ratio > 0.7) return "lab";
    return "pyrolysis"; // Default to pyrolysis check
  };

  return (
    <div className="relative w-full overflow-hidden bg-gray-50 min-h-screen">
      {/* Top Header */}
      <div className="py-6 px-8 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">
            Biochar Removal Ledger
          </h2>
          <p className="text-xs text-gray-500 mt-1 font-medium">
            Production Registry & Cryptographic Verification Audit Trail
          </p>
        </div>
        <div className="text-xs font-mono bg-gray-100 px-3 py-1.5 rounded text-gray-600 border border-gray-200">
          Total Batches: {batches.length}
        </div>
      </div>

      <div className="p-8">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Batch Lot ID
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Feedstock Type
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Dry Mass (tons)
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Molar H:C Ratio
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Net Removal (tCO₂e)
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {batches.map((batch) => (
                  <tr
                    key={batch.id}
                    onClick={() => setSelectedBatch(batch)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors duration-150"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-bold text-gray-900">
                      {batch.batch_lot_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 capitalize">
                      {batch.feedstock_type.replace("_", " ")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {batch.dry_mass_tons.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                      {batch.molar_hc_ratio !== null && batch.molar_hc_ratio !== undefined
                        ? batch.molar_hc_ratio.toFixed(2)
                        : "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-emerald-700 font-bold">
                      {batch.net_sequestration_tco2e.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-0.5 text-xs font-mono font-bold rounded-full border ${getStatusStyle(
                          batch.status
                        )}`}
                      >
                        {batch.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Slide-out Detail Panel overlay */}
      {selectedBatch && (
        <div className="fixed inset-0 z-40 flex justify-end">
          {/* Backdrop */}
          <div
            onClick={() => setSelectedBatch(null)}
            className="absolute inset-0 bg-gray-900 bg-opacity-30 backdrop-blur-xs transition-opacity duration-300"
          />

          {/* Panel */}
          <div className="relative w-[500px] h-full bg-white shadow-2xl z-50 border-l border-gray-200 flex flex-col transition-transform duration-300 transform translate-x-0">
            {/* Header */}
            <div className="py-5 px-6 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest block">
                  Batch Detail Audit
                </span>
                <h3 className="text-md font-bold text-gray-900 font-mono mt-0.5">
                  {selectedBatch.batch_lot_number}
                </h3>
              </div>
              <button
                onClick={() => setSelectedBatch(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Timeline visual representation */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <BatchTimeline
                  status={selectedBatch.status}
                  failedStage={getFailedStage(selectedBatch)}
                />
              </div>

              {/* Technical Identifiers */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Technical Identifiers
                </h4>
                <div className="bg-gray-50 rounded border border-gray-150 p-3 space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Batch UUID:</span>
                    <span className="font-mono text-gray-900 select-all font-semibold">
                      {selectedBatch.id}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Project Name:</span>
                    <span className="text-gray-900 font-semibold">
                      {selectedBatch.project_name || "Unassigned"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Project UUID:</span>
                    <span className="font-mono text-gray-900 select-all">
                      {selectedBatch.project_id || "Unassigned"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Laboratory Analysis Metadata */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Laboratory Verification Metadata
                </h4>
                {selectedBatch.lab_assay ? (
                  <div className="bg-gray-50 rounded border border-gray-150 p-4 space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-gray-500 block">Organic Carbon %</span>
                        <span className="text-sm font-bold text-gray-900 mt-0.5 block">
                          {selectedBatch.lab_assay.organic_carbon_percentage?.toFixed(2)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block">Molar H:C Ratio</span>
                        <span className="text-sm font-bold font-mono text-gray-900 mt-0.5 block">
                          {selectedBatch.lab_assay.molar_hc_ratio?.toFixed(4)}
                        </span>
                      </div>
                    </div>
                    <hr className="border-gray-200" />
                    <div>
                      <span className="text-gray-500 block">Verification Tier</span>
                      <span className="text-xs font-bold text-purple-700 mt-0.5 capitalize block">
                        {selectedBatch.lab_assay.verification_tier?.replace(/_/g, " ") || "Pending"}
                      </span>
                    </div>
                    <hr className="border-gray-200" />
                    <div>
                      <span className="text-gray-500 block">Lab Certificate SHA-256 Hash</span>
                      <span className="text-[10px] font-mono text-gray-900 break-all select-all font-semibold mt-1 block">
                        {selectedBatch.lab_assay.certificate_hash || "—"}
                      </span>
                    </div>
                    <hr className="border-gray-200" />
                    <div className="flex justify-between">
                      <span className="text-gray-500">Report Uploaded At:</span>
                      <span className="text-gray-900 font-medium">
                        {selectedBatch.lab_assay.uploaded_at
                          ? new Date(selectedBatch.lab_assay.uploaded_at).toLocaleString()
                          : "Pending"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 text-center py-4 bg-gray-50 rounded border border-dashed border-gray-300">
                    No Lab Assay data uploaded for this batch.
                  </div>
                )}
              </div>

              {/* Outbound Distribution Sinks (Deliveries) */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Outbound Distribution Sinks
                </h4>
                {selectedBatch.distribution_sinks && selectedBatch.distribution_sinks.length > 0 ? (
                  <div className="space-y-2">
                    {selectedBatch.distribution_sinks.map((sink) => (
                      <div
                        key={sink.delivery_ticket_id}
                        className="bg-white border border-gray-200 rounded p-3 text-xs space-y-2"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-mono font-bold text-gray-900">
                            {sink.delivery_ticket_id}
                          </span>
                          <span
                            className={`px-2 py-0.5 font-mono text-[10px] rounded border ${
                              sink.attestation_timestamp
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-yellow-50 text-yellow-700 border-yellow-200 animate-pulse"
                            }`}
                          >
                            {sink.attestation_timestamp ? "Attested" : "Awaiting Attestation"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-gray-600">
                          <div>
                            <span className="text-[10px] text-gray-400 block uppercase">Farmer ID</span>
                            <span className="font-semibold text-gray-800">{sink.farmer_id}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-400 block uppercase">Shipped Mass</span>
                            <span className="font-semibold text-gray-800">{sink.shipped_mass_tons} tons</span>
                          </div>
                        </div>
                        {sink.attestation_timestamp && (
                          <div className="text-[10px] text-gray-400 flex justify-between items-center pt-1.5 border-t border-gray-100">
                            <span>Attestation Date:</span>
                            <span className="font-medium text-gray-600">
                              {new Date(sink.attestation_timestamp).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 text-center py-4 bg-gray-50 rounded border border-dashed border-gray-300">
                    No distribution sinks registered for this batch.
                  </div>
                )}
              </div>

              {/* Linked Sequestration Summary Metrics */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Methodology & Carbon Math
                </h4>
                <div className="bg-gray-50 rounded border border-gray-150 p-4 space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-500 block">Dry Biomass Equivalent</span>
                      <span className="text-sm font-bold text-gray-900 mt-0.5 block">
                        {selectedBatch.dry_mass_tons.toFixed(2)} tons
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Net CO₂e Sequestration</span>
                      <span className="text-sm font-bold text-emerald-700 mt-0.5 block">
                        {selectedBatch.net_sequestration_tco2e.toFixed(4)} tCO₂e
                      </span>
                    </div>
                  </div>
                  <hr className="border-gray-200" />
                  <div className="text-[10px] text-gray-400 leading-relaxed">
                    Values calculated dynamically using IPCC/Puro.earth methodology guidelines.
                    Gross removals are adjusted by 10% moisture content and offset by accumulated electrical and diesel emissions telemetry.
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Summary */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
              <span>Created: {new Date(selectedBatch.created_at).toLocaleDateString()}</span>
              <span>Updated: {new Date(selectedBatch.updated_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default BatchLedger;
