import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface HistoryLine {
  id: string;
  quantity: unknown;
  unitPriceSnapshot: unknown;
  catalogItem: { name: string };
}

interface HistoryMovement {
  id: string;
  type: string;
  createdAt: Date;
  lines: HistoryLine[];
}

const TYPE_LABELS: Record<string, string> = {
  PRODUCTION_CONSUME: "Списано",
  PRODUCTION_OUTPUT: "Выпущено",
};

/** Individual CONSUME/OUTPUT postings for a ProductionOrder — with partial
 * completion, the aggregate completedQuantity alone doesn't show each pass,
 * so this lists them out with date/quantity/cost. */
export function ProductionOrderHistory({ movements }: { movements: HistoryMovement[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <h2 className="text-lg font-medium">История выполнения</h2>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Товар</TableHead>
              <TableHead className="text-right">Количество</TableHead>
              <TableHead className="text-right">Цена</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.flatMap((m) =>
              m.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{m.createdAt.toLocaleString("ru-RU")}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{TYPE_LABELS[m.type] ?? m.type}</Badge>
                  </TableCell>
                  <TableCell>{line.catalogItem.name}</TableCell>
                  <TableCell className="text-right">{String(line.quantity)}</TableCell>
                  <TableCell className="text-right">
                    {line.unitPriceSnapshot != null ? Number(line.unitPriceSnapshot).toFixed(2) : "—"}
                  </TableCell>
                </TableRow>
              )),
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
