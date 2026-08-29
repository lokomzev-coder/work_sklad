"use client";

import { Cell, Pie, PieChart } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { statusChartColor } from "@/lib/status-color";

interface StatusDonutChartProps {
  data: { name: string; color: string; count: number }[];
  className?: string;
}

export function StatusDonutChart({ data, className }: StatusDonutChartProps) {
  const config: ChartConfig = Object.fromEntries(
    data.map((d) => [d.name, { label: d.name, color: statusChartColor(d.color) }]),
  );

  if (data.length === 0) {
    return (
      <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
        Нет данных за период
      </div>
    );
  }

  return (
    <ChartContainer config={config} className={className}>
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
        <Pie data={data} dataKey="count" nameKey="name" innerRadius={54} outerRadius={82} strokeWidth={2}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={statusChartColor(entry.color)} stroke="var(--card)" />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
      </PieChart>
    </ChartContainer>
  );
}
