import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatFinanceMoney, type FinancialTrendMonth } from "@/services/financeService";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

const chartConfig = {
  revenue: { label: "Receita", color: "hsl(var(--success))" },
  expenses: { label: "Saídas", color: "hsl(var(--destructive))" },
  net_result: { label: "Resultado", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

type Props = {
  data: FinancialTrendMonth[];
};

export function FinancialTrendChart({ data }: Props) {
  const chartData = data.map((m) => ({
    ...m,
    shortLabel: m.month.slice(5) + "/" + m.month.slice(2, 4),
  }));

  return (
    <ChartContainer config={chartConfig} className="aspect-[2.4/1] min-h-[220px] w-full">
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillNet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-net_result)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-net_result)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) =>
            v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
          }
          width={52}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="font-medium">
                  {chartConfig[name as keyof typeof chartConfig]?.label ?? name}:{" "}
                  {formatFinanceMoney(Number(value))}
                </span>
              )}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-revenue)"
          fill="url(#fillRevenue)"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="net_result"
          stroke="var(--color-net_result)"
          fill="url(#fillNet)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
