"use client";

interface PrintLine {
  name: string;
  quantity: string;
  unit: string;
  price: string;
  sum: string;
}

interface PrintProductionDocumentProps {
  title: string;
  issuer: {
    name: string;
    inn?: string | null;
    kpp?: string | null;
    ogrn?: string | null;
    address?: string | null;
    bankName?: string | null;
    bankBik?: string | null;
    bankAccount?: string | null;
  };
  materialsStoreName: string;
  productsStoreName: string;
  assignedEmployeeName: string | null;
  statusName: string;
  progress: { completed: string; total: string };
  consumedLines: PrintLine[];
  outputLines: PrintLine[];
  totalCost: string;
  currency: string;
  isPosted: boolean;
  /** Default true — omitting this prop leaves existing callers unchanged. */
  showPrices?: boolean;
}

function LinesTable({ lines, showPrices }: { lines: PrintLine[]; showPrices: boolean }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b-2 border-gray-800">
          <th className="py-1 text-left">№</th>
          <th className="py-1 text-left">Наименование</th>
          <th className="py-1 text-right">Кол-во</th>
          <th className="py-1 text-left">Ед.</th>
          {showPrices && (
            <>
              <th className="py-1 text-right">Цена</th>
              <th className="py-1 text-right">Сумма</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {lines.map((line, i) => (
          <tr key={i} className="border-b border-gray-200">
            <td className="py-1">{i + 1}</td>
            <td className="py-1">{line.name}</td>
            <td className="py-1 text-right">{line.quantity}</td>
            <td className="py-1">{line.unit}</td>
            {showPrices && (
              <>
                <td className="py-1 text-right">{line.price}</td>
                <td className="py-1 text-right">{line.sum}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PrintProductionDocument({
  title,
  issuer,
  materialsStoreName,
  productsStoreName,
  assignedEmployeeName,
  statusName,
  progress,
  consumedLines,
  outputLines,
  totalCost,
  currency,
  isPosted,
  showPrices = true,
}: PrintProductionDocumentProps) {
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      <div className="mb-4 flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Печать / Сохранить PDF
        </button>
      </div>

      <h1 className="mb-1 text-xl font-semibold">{title}</h1>

      <div className="mb-4 border-b border-gray-300 pb-3 text-sm leading-relaxed">
        <div className="font-medium">{issuer.name}</div>
        {issuer.inn && <div>ИНН {issuer.inn}{issuer.kpp ? ` / КПП ${issuer.kpp}` : ""}</div>}
        {issuer.ogrn && <div>ОГРН {issuer.ogrn}</div>}
        {issuer.address && <div>{issuer.address}</div>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-gray-500">Склад материалов: </span>
          <span className="font-medium">{materialsStoreName}</span>
        </div>
        <div>
          <span className="text-gray-500">Склад продукции: </span>
          <span className="font-medium">{productsStoreName}</span>
        </div>
        <div>
          <span className="text-gray-500">Ответственный: </span>
          <span className="font-medium">{assignedEmployeeName ?? "—"}</span>
        </div>
        <div>
          <span className="text-gray-500">Статус: </span>
          <span className="font-medium">{statusName}</span>
        </div>
        <div>
          <span className="text-gray-500">Выполнено: </span>
          <span className="font-medium">
            {progress.completed} из {progress.total}
          </span>
        </div>
      </div>

      {!isPosted && (
        <p className="mb-3 text-sm text-gray-500">
          Плановый расчёт — задание ещё не выполнялось, суммы и фактический расход не проведены.
        </p>
      )}

      <h2 className="mb-1 mt-4 text-sm font-semibold uppercase text-gray-600">Списано сырья</h2>
      <LinesTable lines={consumedLines} showPrices={showPrices} />

      <h2 className="mb-1 mt-4 text-sm font-semibold uppercase text-gray-600">Выпущено готовой продукции</h2>
      <LinesTable lines={outputLines} showPrices={showPrices} />

      {showPrices && (
        <div className="mt-3 flex justify-end text-base font-semibold">
          Себестоимость выпуска: {totalCost} {currency}
        </div>
      )}

      <div className="mt-16 grid grid-cols-2 gap-8 text-sm">
        <div>
          <div className="border-t border-gray-800 pt-1">Подпись ответственного</div>
        </div>
        <div>
          <div className="border-t border-gray-800 pt-1">М.П.</div>
        </div>
      </div>
    </div>
  );
}
