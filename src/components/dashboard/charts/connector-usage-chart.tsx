"use client";

import React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { CONNECTOR_USAGE_DATA } from "@/lib/mock-data";

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { color: string } }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 shadow-modal text-xs">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: d.payload.color }} />
        <span className="font-medium text-foreground">{d.name}</span>
        <span className="text-muted-foreground">{d.value}%</span>
      </div>
    </div>
  );
}

export function ConnectorUsageChart() {
  const [active, setActive] = React.useState<number | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 }}
      className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] shadow-card p-5"
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">Connector Usage</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Data volume share by source</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="h-44 w-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={CONNECTOR_USAGE_DATA}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
                onMouseEnter={(_, idx) => setActive(idx)}
                onMouseLeave={() => setActive(null)}
              >
                {CONNECTOR_USAGE_DATA.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    opacity={active === null || active === index ? 1 : 0.4}
                    stroke="none"
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex-1 space-y-2 min-w-0">
          {CONNECTOR_USAGE_DATA.map((d, i) => (
            <div
              key={d.name}
              className="flex items-center gap-2"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: d.color }}
              />
              <span className="min-w-0 truncate text-xs text-muted-foreground flex-1">
                {d.name}
              </span>
              <span className="text-xs font-semibold text-foreground tabular-nums">
                {d.value}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
