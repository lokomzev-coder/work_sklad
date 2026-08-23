"use client";

interface PrintLine {
  name: string;
  quantity: string;
  unit: string;
  price: string;
  sum: string;
}

interface PrintDocumentProps {
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
  counterpartyLabel: string;
  counterparty: {
    name: string;
    inn?: string | null;
    address?: string | null;
  } | null;
  lines: PrintLine[];
  total: string;
  currency: string;
}

export function PrintDocument({
  title,
  issuer,
  counterpartyLabel,
  counterparty,
  lines,
  total,
  currency,
}: PrintDocumentProps) {
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
        {issuer.bankName && (
          <div>
            {issuer.bankName}
            {issuer.bankBik ? `, БИК ${issuer.bankBik}` : ""}
            {issuer.bankAccount ? `, р/с ${issuer.bankAccount}` : ""}
          </div>
        )}
      </div>

      <div className="mb-4 text-sm">
        <span className="text-gray-500">{counterpartyLabel}: </span>
        {counterparty ? (
          <>
            <span className="font-medium">{counterparty.name}</span>
            {counterparty.inn && <span>, ИНН {counterparty.inn}</span>}
            {counterparty.address && <span>, {counterparty.address}</span>}
          </>
        ) : (
          "—"
        )}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-gray-800">
            <th className="py-1 text-left">№</th>
            <th className="py-1 text-left">Наименование</th>
            <th className="py-1 text-right">Кол-во</th>
            <th className="py-1 text-left">Ед.</th>
            <th className="py-1 text-right">Цена</th>
            <th className="py-1 text-right">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="border-b border-gray-200">
              <td className="py-1">{i + 1}</td>
              <td className="py-1">{line.name}</td>
              <td className="py-1 text-right">{line.quantity}</td>
              <td className="py-1">{line.unit}</td>
              <td className="py-1 text-right">{line.price}</td>
              <td className="py-1 text-right">{line.sum}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex justify-end text-base font-semibold">
        Итого: {total} {currency}
      </div>

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
