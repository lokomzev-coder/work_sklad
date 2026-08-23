export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh bg-gray-100 print:bg-white">{children}</div>;
}
