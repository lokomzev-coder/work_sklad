import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ href }: { href: string }) {
  return (
    <Button variant="outline" size="sm" render={<Link href={href} target="_blank" rel="noopener" />}>
      <Printer className="size-4" />
      Печать
    </Button>
  );
}
