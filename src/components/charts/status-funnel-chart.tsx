"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { statusChartColor } from "@/lib/status-color";

interface StatusFunnelChartProps {
  data: { name: string; color: string; count: number }[];
  className?: string;
}

const config: ChartConfig = { count: { label: "Документов" } };

/** Block G2 phase 6 — current distribution across statuses, ordered by
 * `DocumentStatus.position` (the caller is responsible for that ordering —
 * this component just renders whatever order it's given) rather than an
 * unordered breakdown like StatusDonutChart. Deliberately NOT a true
 * conversion funnel (no historical "moved from A to B" data exists) — see
 * getStatusFunnelReport's own comment for why. */
export function StatusFunnelChart({ data, className }: StatusFunnelChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
        Нет статусов
      </div>
    );
  }

  return (
    <ChartContainer config={config} className={className}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickLine={false} axisLine={false} tickMargin={4} allowDecimals={false} />
        <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={140} tick={{ fontSize: 12 }} />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="count" radius={4}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={statusChartColor(entry.color)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
