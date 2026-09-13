"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SubscriptionPlanForm, type PlanFeatureOption } from "@/components/admin/subscription-plan-form";

export function CreateSubscriptionPlanInline({ featureOptions = [] }: { featureOptions?: PlanFeatureOption[] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Создать тариф
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <SubscriptionPlanForm featureOptions={featureOptions} onDone={() => setOpen(false)} />
      </CardContent>
    </Card>
  );
}
