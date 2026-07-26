import React from "react";

export type BatchStatus =
  | "sourcing_purgatory"
  | "processing_active"
  | "lab_certified"
  | "completed"
  | "ineligible";

export type TimelineStage = "sourcing" | "pyrolysis" | "lab" | "sinks";

export interface BatchTimelineProps {
  status: BatchStatus;
  failedStage?: TimelineStage; // Explicit failed stage if status is 'ineligible'
}

interface StageConfig {
  key: TimelineStage;
  label: string;
  statusLabel: string;
}

const STAGES: StageConfig[] = [
  { key: "sourcing", label: "Sourcing Approved", statusLabel: "sourcing_purgatory" },
  { key: "pyrolysis", label: "Pyrolysis Verified", statusLabel: "processing_active" },
  { key: "lab", label: "Lab Certified", statusLabel: "lab_certified" },
  { key: "sinks", label: "Sinks Closed", statusLabel: "completed" },
];

export const BatchTimeline: React.FC<BatchTimelineProps> = ({
  status,
  failedStage = "pyrolysis", // Defaults to pyrolysis failure if marked ineligible
}) => {
  const isFailed = status === "ineligible";

  // Determine stage index
  const getStageIndex = (s: BatchStatus): number => {
    switch (s) {
      case "sourcing_purgatory":
        return 0;
      case "processing_active":
        return 1;
      case "lab_certified":
        return 2;
      case "completed":
        return 3;
      case "ineligible":
        // Find index of the failed stage
        return STAGES.findIndex((stage) => stage.key === failedStage);
      default:
        return 0;
    }
  };

  const currentStageIndex = getStageIndex(status);

  return (
    <div className="w-full py-8 px-4 bg-white border border-gray-100 rounded-lg shadow-sm">
      <div className="max-w-4xl mx-auto">
        {/* Header Summary */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Batch Pipeline Status
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold text-gray-900">Lifecycle Progress</span>
              <span
                className={`inline-block px-2.5 py-0.5 text-xs font-mono font-bold rounded-full border ${
                  isFailed
                    ? "bg-red-50 text-red-700 border-red-200"
                    : status === "completed"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-blue-50 text-blue-700 border-blue-200"
                }`}
              >
                {status}
              </span>
            </div>
          </div>
          {isFailed && (
            <div className="text-right">
              <span className="text-xs font-semibold text-red-500 uppercase tracking-widest block">
                Validation Alert
              </span>
              <span className="text-sm font-bold text-red-700">
                Pipeline Aborted at Stage {currentStageIndex + 1}
              </span>
            </div>
          )}
        </div>

        {/* Timeline Visual Track */}
        <div className="relative flex items-center justify-between">
          {/* Background Connecting Line */}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] w-full bg-gray-100 -z-10" />

          {/* Progress Connecting Line */}
          <div
            className={`absolute left-0 top-1/2 -translate-y-1/2 h-[2px] transition-all duration-500 ease-in-out -z-10 ${
              isFailed ? "bg-red-300" : "bg-emerald-500"
            }`}
            style={{
              width: `${(currentStageIndex / (STAGES.length - 1)) * 100}%`,
            }}
          />

          {/* Timeline Nodes */}
          {STAGES.map((stage, index) => {
            const isStageFailed = isFailed && stage.key === failedStage;
            const isCompleted = !isFailed
              ? index < currentStageIndex
              : index < currentStageIndex;
            const isActive = !isFailed && index === currentStageIndex;
            const isPending = !isFailed && index > currentStageIndex;
            const isPastFailure = isFailed && index > currentStageIndex;

            let circleClass = "";
            let textClass = "";
            let statusBadge = "";

            if (isStageFailed) {
              circleClass = "bg-red-500 border-red-500 text-white ring-4 ring-red-100";
              textClass = "text-red-600 font-semibold";
              statusBadge = "Failed";
            } else if (isCompleted || (status === "completed" && index === 3)) {
              circleClass = "bg-emerald-500 border-emerald-500 text-white";
              textClass = "text-gray-900 font-medium";
              statusBadge = "Passed";
            } else if (isActive) {
              circleClass = "bg-white border-emerald-500 border-4 text-emerald-600 ring-4 ring-emerald-100 animate-pulse";
              textClass = "text-emerald-700 font-bold";
              statusBadge = "Active";
            } else if (isPastFailure) {
              circleClass = "bg-gray-100 border-gray-200 text-gray-300";
              textClass = "text-gray-400";
              statusBadge = "Aborted";
            } else {
              circleClass = "bg-white border-gray-300 text-gray-400";
              textClass = "text-gray-500";
              statusBadge = "Pending";
            }

            return (
              <div key={stage.key} className="flex flex-col items-center relative">
                {/* Node Circle */}
                <div
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-300 ${circleClass}`}
                >
                  {isStageFailed ? (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : isCompleted || (status === "completed" && index === 3) ? (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>

                {/* Text Labels */}
                <div className="absolute top-10 flex flex-col items-center w-36 text-center">
                  <span className={`text-xs tracking-tight ${textClass}`}>{stage.label}</span>
                  <span className="text-[10px] font-mono text-gray-400 mt-0.5 uppercase tracking-wider">
                    {statusBadge}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Margin bottom spacer to accommodate absolute labels */}
      <div className="h-10" />
    </div>
  );
};
export default BatchTimeline;
