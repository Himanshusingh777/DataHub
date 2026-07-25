"use client";

import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { motion } from "framer-motion";
import { PIPELINE_HEALTH_DATA } from "@/lib/mock-data";

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2.5 shadow-modal text-xs">
      <p className="font-semibold text-foreground truncate max-w-[160px]">{label}</p>
      <p className="mt-1 text-muted-foreground">
        Success rate:{" "}
        <span className={`font-semibold ${val >= 97 ? "text-emerald-600" : val >= 92 ? "text-amber-600" : "text-rose-600"}`}>
          {val}%
        </span>
      </p>
    </div>
  );
}

export function PipelineHealthChart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] shadow-card p-5"
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Pipeline Health</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Success rate by pipeline</p>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" /> ≥97%
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm bg-amber-400" /> 92–97%
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm bg-rose-400" /> &lt;92%
          </span>
        </div>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={PIPELINE_HEALTH_DATA}
            layout="vertical"
            margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis
              type="number"
              domain={[85, 100]}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={90}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", radius: 6 }} />
            <Bar dataKey="successRate" radius={[0, 5, 5, 0]} maxBarSize={18}>
              {PIPELINE_HEALTH_DATA.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={
                    entry.successRate >= 97
                      ? "#22c55e"
                      : entry.successRate >= 92
                      ? "#f59e0b"
                      : "#f43f5e"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
