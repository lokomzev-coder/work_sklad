import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

interface MovementFiltersProps {
  type?: string;
  storeId?: string;
  from?: string;
  to?: string;
  typeOptions: { value: string; label: string }[];
  storeOptions: { value: string; label: string }[];
}

/**
 * Block W (explicit request, 2026-09-21) — same plain-GET-form idiom as
 * reports/period-filter.tsx: no client JS, submitting re-navigates with
 * ?type=&storeId=&from=&to=, which the warehouse list page reads
 * server-side. Native <select> (not the app's client Select component) for
 * the same reason PeriodFilter uses a plain <input type="date"> — this form
 * must work with zero JS.
 */
export function MovementFilters({ type, storeId, from, to, typeOptions, storeOptions }: MovementFiltersProps) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="type">Тип</Label>
        <select id="type" name="type" defaultValue={type ?? ""} className={`${SELECT_CLASS} w-44`}>
          <option value="">Все типы</option>
          {typeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="storeId">Склад</Label>
        <select id="storeId" name="storeId" defaultValue={storeId ?? ""} className={`${SELECT_CLASS} w-44`}>
          <option value="">Все склады</option>
          {storeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
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
      {(type || storeId || from || to) && (
        <Button type="button" variant="ghost" render={<a href="?" />}>
          Сбросить
        </Button>
      )}
    </form>
  );
}
