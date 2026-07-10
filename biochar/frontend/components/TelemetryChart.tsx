import React from "react";

export interface TelemetryPoint {
  timestamp: string;
  kiln_temperature_celsius: number;
}

export interface TelemetryChartProps {
  data: TelemetryPoint[];
}

export const TelemetryChart: React.FC<TelemetryChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-gray-50 border border-gray-200 border-dashed rounded-lg text-sm text-gray-400">
        No telemetry sensor data available.
      </div>
    );
  }

  // Define SVG dimensions & padding
  const width = 600;
  const height = 300;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 30;
  const paddingBottom = 40;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Determine Y-axis limits (guaranteeing 350C is visible)
  const temperatures = data.map((d) => d.kiln_temperature_celsius);
  const minTemp = Math.min(...temperatures);
  const maxTemp = Math.max(...temperatures);

  const yMin = Math.min(200, Math.floor(minTemp / 50) * 50);
  const yMax = Math.max(600, Math.ceil(maxTemp / 50) * 50);
  const yRange = yMax - yMin;

  // Calculate coordinates
  const points = data.map((d, i) => {
    const x = paddingLeft + (i / Math.max(1, data.length - 1)) * chartWidth;
    const y = height - paddingBottom - ((d.kiln_temperature_celsius - yMin) / yRange) * chartHeight;
    return { x, y, temp: d.kiln_temperature_celsius, timestamp: d.timestamp };
  });

  // Helper to generate a smooth Bezier path through coordinates
  const getBezierPath = (pts: { x: number; y: number }[]): string => {
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    
    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      // Control points for a natural smooth horizontal spline
      const cpX1 = p0.x + (p1.x - p0.x) / 3;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (2 * (p1.x - p0.x)) / 3;
      const cpY2 = p1.y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
    return path;
  };

  // Build line path
  const linePath = getBezierPath(points);

  // Build area path (for shaded region under the line)
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`
    : "";

  // 350°C line height mapping
  const y350 = height - paddingBottom - ((350 - yMin) / yRange) * chartHeight;

  // Detect if any points fell below 350C
  const failedPoints = points.filter((p) => p.temp < 350.0);
  const hasFailed = failedPoints.length > 0;

  // Generate Y axis tick marks
  const ticks = [];
  const tickStep = yRange / 5;
  for (let i = 0; i <= 5; i++) {
    ticks.push(yMin + i * tickStep);
  }

  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      {/* Header Info */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="text-sm font-bold text-gray-900">Pyrolysis Telemetry Graph</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Real-time kiln temperature sensor readings (°C)
          </p>
        </div>
        <div className="text-right">
          {hasFailed ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-bold bg-red-50 text-red-700 border border-red-200 rounded-full">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              Stability Violation
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Thermal Compliant
            </div>
          )}
        </div>
      </div>

      {/* SVG Plot */}
      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
        >
          {/* Grid lines */}
          {ticks.map((tick) => {
            const y = height - paddingBottom - ((tick - yMin) / yRange) * chartHeight;
            return (
              <g key={tick}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#F3F4F6"
                  strokeWidth={1}
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="font-mono text-[10px] fill-gray-400 font-medium"
                >
                  {Math.round(tick)}
                </text>
              </g>
            );
          })}

          {/* X axis line */}
          <line
            x1={paddingLeft}
            y1={height - paddingBottom}
            x2={width - paddingRight}
            y2={height - paddingBottom}
            stroke="#E5E7EB"
            strokeWidth={1}
          />

          {/* Shaded Area Under Line */}
          {areaPath && (
            <path
              d={areaPath}
              fill="url(#indigoGrad)"
              opacity={0.06}
            />
          )}

          {/* Primary Temperature Line */}
          <path
            d={linePath}
            fill="none"
            stroke="#6366F1"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dotted 350°C Reference line */}
          <line
            x1={paddingLeft}
            y1={y350}
            x2={width - paddingRight}
            y2={y350}
            stroke="#EF4444"
            strokeWidth={1.5}
            strokeDasharray="4,4"
          />
          <text
            x={width - paddingRight}
            y={y350 - 6}
            textAnchor="end"
            className="font-mono text-[9px] fill-red-500 font-bold tracking-wider"
          >
            350°C MINIMUM STABILITY THRESHOLD
          </text>

          {/* Draw Red Highlights on Failing Points */}
          {failedPoints.map((p, idx) => (
            <g key={idx}>
              <circle
                cx={p.x}
                cy={p.y}
                r={5}
                className="fill-red-500 stroke-white stroke-2"
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={10}
                className="fill-red-400 stroke-none opacity-20 animate-ping"
              />
            </g>
          ))}

          {/* Start / End X Axis Labels */}
          {points.length > 0 && (
            <>
              <text
                x={points[0].x}
                y={height - 15}
                textAnchor="start"
                className="font-mono text-[10px] fill-gray-400"
              >
                {new Date(points[0].timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </text>
              <text
                x={points[points.length - 1].x}
                y={height - 15}
                textAnchor="end"
                className="font-mono text-[10px] fill-gray-400"
              >
                {new Date(points[points.length - 1].timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </text>
            </>
          )}

          {/* SVG Gradients */}
          <defs>
            <linearGradient id="indigoGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Warning message if validation fails */}
      {hasFailed && (
        <div className="mt-4 p-3.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2.5">
          <svg
            className="w-4 h-4 text-red-500 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <span className="font-bold">Thermal Stability Violation:</span> Operating temperature fell below the critical 350°C line. A total of {failedPoints.length} reading(s) violated this boundary check, causing this batch to be marked as <span className="font-mono font-bold uppercase">ineligible</span>.
          </div>
        </div>
      )}
    </div>
  );
};
export default TelemetryChart;
