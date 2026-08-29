"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { formatValue, type ValueFormat } from "@/lib/format";

export interface AreaTrendSeries {
  key: string;
  label: string;
  color: string;
}

interface AreaTrendChartProps {
  data: ({ date: string } & Record<string, string | number>)[];
  series: AreaTrendSeries[];
  format: ValueFormat;
  className?: string;
}

/** Shared area chart used both by the dashboard's revenue trend and the
 * reports/overview cash-flow chart — one or two series over the same daily
 * x-axis. Colors are passed in (not the fixed --chart-1..5 tokens) so a
 * caller can align a series with a real domain color (e.g. IN/OUT payment
 * direction) when that reads better than the generic chart palette. */
export function AreaTrendChart({ data, series, format, className }: AreaTrendChartProps) {
  const valueFormatter = (value: number) => formatValue(value, format);
  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  );

  const hasData = data.some((row) => series.some((s) => Number(row[s.key]) > 0));
  if (!hasData) {
    return (
      <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
        Нет данных за период
      </div>
    );
  }

  return (
    <ChartContainer config={config} className={className}>
      <AreaChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value: string) =>
            new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
          }
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={56}
          tickFormatter={(value: number) => valueFormatter(value)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) =>
                new Date(String(value)).toLocaleDateString("ru-RU", { day: "2-digit", month: "long" })
              }
              formatter={(value, name, item) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: (item.color as string) ?? undefined }}
                    />
                    {config[name as string]?.label ?? name}
                  </span>
                  <span className="font-mono font-medium text-foreground tabular-nums">
                    {valueFormatter(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Area
            key={s.key}
            dataKey={s.key}
            type="monotone"
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.14}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
