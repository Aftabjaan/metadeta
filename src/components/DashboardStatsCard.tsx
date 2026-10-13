import React, { useState } from 'react';
import { ApiUsageStats } from '../types';
import { Sparkles, Cpu, Activity, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface DashboardStatsCardProps {
  stats: ApiUsageStats | null;
  onResetStats?: () => void;
}

// Sparkline Point data structure
interface SparklineDataPoint {
  date: string;
  value: number;
}

// Custom High-Fidelity SVG Sparkline component with hover tooltips to avoid ResizeObserver crashes
function CustomSparkline({
  data,
  color,
  gradientId,
  label,
}: {
  data: SparklineDataPoint[];
  color: string;
  gradientId: string;
  label: string;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[10px] text-slate-500">
        No historical trend data
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 280;
  const height = 48;

  // Map values to coordinates
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * (width - 16) + 8;
    const y = height - ((d.value - min) / range) * (height - 12) - 6;
    return { x, y, date: d.date, value: d.value };
  });

  // Construct SVG Path
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    // Smooth bezier curves between points
    const cpX1 = points[i - 1].x + (points[i].x - points[i - 1].x) / 3;
    const cpY1 = points[i - 1].y;
    const cpX2 = points[i - 1].x + (2 * (points[i].x - points[i - 1].x)) / 3;
    const cpY2 = points[i].y;
    pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${points[i].x} ${points[i].y}`;
  }

  // Construct closed Area Path for Gradient Fill
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <div className="relative w-full h-full group">
      {/* Tooltip Overlay */}
      {activeIdx !== null && points[activeIdx] && (
        <div
          className="absolute z-10 bg-white border border-slate-200 text-[10px] px-2.5 py-1.5 rounded-lg shadow-md pointer-events-none transition-all duration-100 whitespace-nowrap"
          style={{
            left: `${(activeIdx / (points.length - 1)) * 80 + 10}%`,
            bottom: '100%',
            transform: 'translateX(-50%) translateY(-4px)',
          }}
        >
          <div className="text-slate-500 font-medium">{points[activeIdx].date}</div>
          <div className="font-bold" style={{ color }}>
            {points[activeIdx].value} {label}
          </div>
        </div>
      )}

      {/* SVG Vector Graphic */}
      <div className="w-full h-full">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0.0} />
            </linearGradient>
          </defs>

          {/* Shaded Area */}
          <path d={areaD} fill={`url(#${gradientId})`} />

          {/* Stroke Line */}
          <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />

          {/* Hover highlight line */}
          {activeIdx !== null && points[activeIdx] && (
            <line
              x1={points[activeIdx].x}
              y1={0}
              x2={points[activeIdx].x}
              y2={height}
              stroke={color}
              strokeWidth={0.75}
              strokeDasharray="2 2"
              className="opacity-50"
            />
          )}

          {/* Point Dots */}
          {points.map((pt, idx) => (
            <circle
              key={idx}
              cx={pt.x}
              cy={pt.y}
              r={activeIdx === idx ? 3.5 : 2}
              fill={activeIdx === idx ? '#ffffff' : color}
              stroke={color}
              strokeWidth={1}
              className="transition-all duration-150"
            />
          ))}
        </svg>
      </div>

      {/* Transparent Trigger Slices to Capture Hover Coordinates cleanly */}
      <div className="absolute inset-0 flex">
        {points.map((_, idx) => (
          <div
            key={idx}
            className="flex-1 h-full cursor-crosshair"
            onMouseEnter={() => setActiveIdx(idx)}
            onMouseLeave={() => setActiveIdx(null)}
          />
        ))}
      </div>
    </div>
  );
}

export function DashboardStatsCard({ stats, onResetStats }: DashboardStatsCardProps) {
  // Ensure we have default safe values if stats are null or lack fields
  const totalReq = stats?.totalRequests ?? 0;
  const totalSuccess = stats?.successfulRequests ?? 0;
  const totalFailed = stats?.failedRequests ?? 0;
  const rateLimitCount = stats?.rateLimitedRequests ?? 0;
  const avgTime = stats?.avgProcessingTimeMs ?? 0;

  return (
    <div id="api-dashboard-stats-container" className="grid grid-cols-1 gap-3 mb-4">
      {/* Cumulative Performance Overview */}
      <div id="cumulative-stats-panel" className="glass-panel p-3 sm:p-3.5 shadow-lg flex flex-col justify-between min-h-[160px]">
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <div className="p-1.5 rounded-lg bg-teal-100 text-teal-600 shrink-0 shadow-sm">
              <Activity className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate font-sans">Cumulative Performance</h3>
              <p className="text-[9px] text-slate-500 font-medium truncate">Aggregated metrics across all engines</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1">
            <div className="flex sm:flex-col items-center justify-between sm:justify-center p-2 rounded-xl bg-slate-50/70 border border-slate-200/50">
              <span className="text-slate-600 flex items-center gap-1 text-[11px] font-medium font-sans">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> Successes / Total
              </span>
              <span className="font-bold text-slate-800 text-xs sm:text-sm font-sans mt-0.5">{totalSuccess} / {totalReq}</span>
            </div>

            <div className="flex sm:flex-col items-center justify-between sm:justify-center p-2 rounded-xl bg-slate-50/70 border border-slate-200/50">
              <span className="text-slate-600 flex items-center gap-1 text-[11px] font-medium font-sans">
                <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" /> Avg Latency
              </span>
              <span className="font-bold text-slate-800 text-xs sm:text-sm font-mono mt-0.5">
                {avgTime > 0 ? `${(avgTime / 1000).toFixed(2)}s` : '—'}
              </span>
            </div>

            <div className="flex sm:flex-col items-center justify-between sm:justify-center p-2 rounded-xl bg-slate-50/70 border border-slate-200/50">
              <span className="text-slate-600 flex items-center gap-1 text-[11px] font-medium font-sans">
                <AlertCircle className="w-3.5 h-3.5 text-orange-600 shrink-0" /> Rate Limited
              </span>
              <span className="font-bold text-slate-800 text-xs sm:text-sm font-sans mt-0.5">{rateLimitCount}</span>
            </div>
          </div>
        </div>

        <div className="text-[9px] text-slate-500 text-center border-t border-slate-200/40 pt-1.5 mt-1.5 font-semibold font-sans">
          Total failed requests: <span className="text-rose-600 font-extrabold">{totalFailed}</span> • Avg latency is <span className="text-teal-600 font-extrabold font-mono">{(avgTime / 1000).toFixed(2)}s</span>
        </div>
      </div>
    </div>
  );
}
