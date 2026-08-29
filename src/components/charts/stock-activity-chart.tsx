"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { STOCK_MOVEMENT_TYPE_LABELS } from "@/lib/stock-labels";

interface StockActivityChartProps {
  data: { type: string; qty: number }[];
  className?: string;
}

const config: ChartConfig = {
  qty: { label: "Количество", color: "var(--chart-2)" },
};

export function StockActivityChart({ data, className }: StockActivityChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
        Нет складских движений за период
      </div>
    );
  }

  const rows = data.map((d) => ({ ...d, label: STOCK_MOVEMENT_TYPE_LABELS[d.type] ?? d.type }));

  return (
    <ChartContainer config={config} className={className}>
      <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickLine={false} axisLine={false} tickMargin={4} />
        <YAxis
          dataKey="label"
          type="category"
          tickLine={false}
          axisLine={false}
          width={120}
          tick={{ fontSize: 12 }}
        />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="qty" fill="var(--color-qty)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
