import { redirect } from "next/navigation";

export default async function ReportsIndexPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  redirect(`/${org}/reports/turnover`);
}
