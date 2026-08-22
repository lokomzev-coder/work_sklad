import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface PeriodFilterProps {
  from?: string;
  to?: string;
}

/** A plain GET form (no client JS needed) — submitting re-navigates with
 * ?from=&to= query params, which the report page reads server-side. */
export function PeriodFilter({ from, to }: PeriodFilterProps) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="from">С</Label>
        <Input id="from" name="from" type="date" defaultValue={from} className="w-40" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="to">По</Label>
        <Input id="to" name="to" type="date" defaultValue={to} className="w-40" />
      </div>
      <Button type="submit" variant="outline">
        Применить
      </Button>
    </form>
  );
}
