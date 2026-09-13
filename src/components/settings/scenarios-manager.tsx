"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityCombobox } from "@/components/forms/entity-combobox";
import { createScenarioRule, toggleScenarioRuleActive, deleteScenarioRule } from "@/actions/scenarios";
import type {
  ScenarioDocumentType,
  ScenarioEventType,
  ScenarioConditionField,
  ScenarioConditionOperator,
  ScenarioActionType,
  Role,
} from "@/generated/prisma/enums";

const DOCUMENT_TYPE_LABELS: Record<ScenarioDocumentType, string> = {
  ORDER: "Заказ",
  PURCHASE_ORDER: "Заказ поставщику",
  INVOICE_OUT: "Счёт покупателю",
  INVOICE_IN: "Счёт поставщика",
  PRODUCTION_ORDER: "Производственное задание",
};

const EVENT_TYPE_LABELS: Record<ScenarioEventType, string> = {
  CREATED: "Создан",
  STATUS_CHANGED: "Статус изменён",
};

const FIELD_LABELS: Record<ScenarioConditionField, string> = {
  STATUS: "Статус",
  COUNTERPARTY: "Контрагент",
  ASSIGNED_EMPLOYEE: "Ответственный",
  TOTAL: "Сумма",
  QUANTITY: "Количество",
};

const NUMERIC_FIELDS = new Set<ScenarioConditionField>(["TOTAL", "QUANTITY"]);
const ID_OPERATORS: ScenarioConditionOperator[] = ["EQUALS", "NOT_EQUALS"];
const NUMERIC_OPERATORS: ScenarioConditionOperator[] = [
  "EQUALS", "NOT_EQUALS", "GREATER_THAN", "GREATER_OR_EQUAL", "LESS_THAN", "LESS_OR_EQUAL",
];

const OPERATOR_LABELS: Record<ScenarioConditionOperator, string> = {
  EQUALS: "равно",
  NOT_EQUALS: "не равно",
  GREATER_THAN: "больше",
  GREATER_OR_EQUAL: "больше или равно",
  LESS_THAN: "меньше",
  LESS_OR_EQUAL: "меньше или равно",
};

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Администратор",
  MANAGER: "Менеджер",
  EMPLOYEE: "Сотрудник",
  PRODUCTION: "Цех",
  CASHIER: "Кассир",
};

// Only these two pairs have real conversion logic (Block M5 precedent) —
// see lib/scenario-actions.ts.
const RELATED_DOCUMENT_TARGETS: Partial<Record<ScenarioDocumentType, { value: string; label: string }>> = {
  ORDER: { value: "INVOICE_OUT", label: "Счёт покупателю" },
  PURCHASE_ORDER: { value: "INVOICE_IN", label: "Счёт поставщика" },
};

interface ConditionRow {
  field: ScenarioConditionField;
  operator: ScenarioConditionOperator;
  value: string;
}

interface ActionRow {
  type: ScenarioActionType;
  config: Record<string, unknown>;
}

interface RuleRow {
  id: string;
  name: string;
  documentType: ScenarioDocumentType;
  eventType: ScenarioEventType;
  isActive: boolean;
  conditions: ConditionRow[];
  actions: ActionRow[];
}

interface Entity {
  id: string;
  name: string;
}

export function ScenariosManager({
  orgSlug,
  canEdit,
  rules,
  statusesByType,
  clients,
  employees,
  customRoles,
  webhooks,
}: {
  orgSlug: string;
  canEdit: boolean;
  rules: RuleRow[];
  statusesByType: Record<string, Entity[]>;
  clients: Entity[];
  employees: Entity[];
  customRoles: Entity[];
  webhooks: { id: string; url: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [documentType, setDocumentType] = useState<ScenarioDocumentType>("ORDER");
  const [eventType, setEventType] = useState<ScenarioEventType>("STATUS_CHANGED");
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);

  function resolveValueOptions(field: ScenarioConditionField): Entity[] {
    if (field === "STATUS") return statusesByType[documentType] ?? [];
    if (field === "COUNTERPARTY") return clients;
    if (field === "ASSIGNED_EMPLOYEE") return employees;
    return [];
  }

  // Existing rules' condition.value is an id for STATUS/COUNTERPARTY/
  // ASSIGNED_EMPLOYEE — resolve it to a human label for the summary badge
  // instead of showing the raw id. Falls back to the raw value if the
  // referenced row was since deleted (same "stale id just stops resolving"
  // tolerance as DocumentStatusTransition's allowedEmployeeIds).
  function resolveConditionValueLabel(rule: RuleRow, condition: ConditionRow): string {
    if (condition.field === "TOTAL" || condition.field === "QUANTITY") return condition.value;
    const options =
      condition.field === "STATUS"
        ? (statusesByType[rule.documentType] ?? [])
        : condition.field === "COUNTERPARTY"
          ? clients
          : employees;
    return options.find((o) => o.id === condition.value)?.name ?? condition.value;
  }

  function addCondition() {
    setConditions((prev) => [...prev, { field: "STATUS", operator: "EQUALS", value: "" }]);
  }

  function updateCondition(index: number, patch: Partial<ConditionRow>) {
    setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function removeCondition(index: number) {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }

  function addAction() {
    const defaultType: ScenarioActionType = RELATED_DOCUMENT_TARGETS[documentType] ? "CREATE_RELATED_DOCUMENT" : "CREATE_NOTIFICATION";
    setActions((prev) => [...prev, defaultConfigFor(defaultType, documentType)]);
  }

  function defaultConfigFor(type: ScenarioActionType, docType: ScenarioDocumentType): ActionRow {
    if (type === "CREATE_RELATED_DOCUMENT") {
      return { type, config: { targetType: RELATED_DOCUMENT_TARGETS[docType]?.value ?? "" } };
    }
    if (type === "CREATE_NOTIFICATION") {
      return { type, config: { allowedRoles: [], allowedCustomRoleIds: [], allowedEmployeeIds: [], title: "", body: "" } };
    }
    return { type, config: { webhookId: "" } };
  }

  function updateAction(index: number, patch: Partial<ActionRow>) {
    setActions((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  function updateActionConfig(index: number, configPatch: Record<string, unknown>) {
    setActions((prev) =>
      prev.map((a, i) => (i === index ? { ...a, config: { ...a.config, ...configPatch } } : a)),
    );
  }

  function removeAction(index: number) {
    setActions((prev) => prev.filter((_, i) => i !== index));
  }

  function resetForm() {
    setName("");
    setDocumentType("ORDER");
    setEventType("STATUS_CHANGED");
    setConditions([]);
    setActions([]);
    setShowForm(false);
  }

  function handleCreate() {
    if (!name.trim() || actions.length === 0) return;
    startTransition(async () => {
      const result = await createScenarioRule(orgSlug, {
        name: name.trim(),
        documentType,
        eventType,
        conditions,
        actions,
      } as Parameters<typeof createScenarioRule>[1]);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Сценарий создан");
        resetForm();
      }
    });
  }

  function handleToggle(id: string, isActive: boolean) {
    startTransition(async () => {
      await toggleScenarioRuleActive(orgSlug, id, isActive);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteScenarioRule(orgSlug, id);
      toast.success("Сценарий удалён");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <div className="flex flex-col gap-4 rounded-md border p-4">
          {!showForm ? (
            <Button type="button" size="sm" className="self-start" onClick={() => setShowForm(true)}>
              Новый сценарий
            </Button>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Название</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, «Счёт при согласовании»" />
              </div>

              <div className="flex gap-4">
                <div className="flex flex-1 flex-col gap-2">
                  <span className="text-sm font-medium">Тип документа</span>
                  <Select
                    value={documentType}
                    items={DOCUMENT_TYPE_LABELS}
                    onValueChange={(v) => {
                      setDocumentType(v as ScenarioDocumentType);
                      setActions([]); // action configs (e.g. CREATE_RELATED_DOCUMENT target) depend on documentType
                    }}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <span className="text-sm font-medium">Событие</span>
                  <Select value={eventType} items={EVENT_TYPE_LABELS} onValueChange={(v) => setEventType(v as ScenarioEventType)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Условия (все должны выполниться)</span>
                {conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select value={c.field} items={FIELD_LABELS} onValueChange={(v) => updateCondition(i, { field: v as ScenarioConditionField, value: "" })}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(FIELD_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={c.operator}
                      items={OPERATOR_LABELS}
                      onValueChange={(v) => updateCondition(i, { operator: v as ScenarioConditionOperator })}
                    >
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(NUMERIC_FIELDS.has(c.field) ? NUMERIC_OPERATORS : ID_OPERATORS).map((op) => (
                          <SelectItem key={op} value={op}>{OPERATOR_LABELS[op]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {NUMERIC_FIELDS.has(c.field) ? (
                      <Input
                        type="number"
                        className="w-32"
                        value={c.value}
                        onChange={(e) => updateCondition(i, { value: e.target.value })}
                      />
                    ) : (
                      <EntityCombobox
                        className="w-56"
                        options={resolveValueOptions(c.field).map((o) => ({ value: o.id, label: o.name }))}
                        value={c.value || null}
                        onChange={(v) => updateCondition(i, { value: v ?? "" })}
                      />
                    )}
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeCondition(i)}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={addCondition}>
                  Добавить условие
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Действия (по порядку)</span>
                {actions.map((a, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <Select
                        value={a.type}
                        items={{
                          ...(RELATED_DOCUMENT_TARGETS[documentType] ? { CREATE_RELATED_DOCUMENT: "Создать связанный документ" } : {}),
                          CREATE_NOTIFICATION: "Создать уведомление",
                          SEND_WEBHOOK: "Отправить вебхук",
                        }}
                        onValueChange={(v) => updateAction(i, defaultConfigFor(v as ScenarioActionType, documentType))}
                      >
                        <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RELATED_DOCUMENT_TARGETS[documentType] && (
                            <SelectItem value="CREATE_RELATED_DOCUMENT">Создать связанный документ</SelectItem>
                          )}
                          <SelectItem value="CREATE_NOTIFICATION">Создать уведомление</SelectItem>
                          <SelectItem value="SEND_WEBHOOK">Отправить вебхук</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeAction(i)}>
                        <X className="size-4" />
                      </Button>
                    </div>

                    {a.type === "CREATE_RELATED_DOCUMENT" && RELATED_DOCUMENT_TARGETS[documentType] && (
                      <p className="text-sm text-muted-foreground">→ {RELATED_DOCUMENT_TARGETS[documentType]!.label}</p>
                    )}

                    {a.type === "CREATE_NOTIFICATION" && (
                      <div className="flex flex-col gap-2">
                        <Input
                          placeholder="Заголовок"
                          value={(a.config.title as string) ?? ""}
                          onChange={(e) => updateActionConfig(i, { title: e.target.value })}
                        />
                        <Input
                          placeholder="Текст уведомления"
                          value={(a.config.body as string) ?? ""}
                          onChange={(e) => updateActionConfig(i, { body: e.target.value })}
                        />
                        <span className="text-xs text-muted-foreground">Кому (не выбрано — никому):</span>
                        <div className="flex flex-wrap gap-3">
                          {(Object.keys(ROLE_LABELS) as Role[]).map((role) => {
                            const selected = ((a.config.allowedRoles as Role[]) ?? []).includes(role);
                            return (
                              <label key={role} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={selected}
                                  onCheckedChange={(checked) => {
                                    const current = (a.config.allowedRoles as Role[]) ?? [];
                                    updateActionConfig(i, {
                                      allowedRoles: checked ? [...current, role] : current.filter((r) => r !== role),
                                    });
                                  }}
                                />
                                {ROLE_LABELS[role]}
                              </label>
                            );
                          })}
                        </div>
                        {customRoles.length > 0 && (
                          <div className="flex flex-wrap gap-3">
                            {customRoles.map((role) => {
                              const selected = ((a.config.allowedCustomRoleIds as string[]) ?? []).includes(role.id);
                              return (
                                <label key={role.id} className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={selected}
                                    onCheckedChange={(checked) => {
                                      const current = (a.config.allowedCustomRoleIds as string[]) ?? [];
                                      updateActionConfig(i, {
                                        allowedCustomRoleIds: checked ? [...current, role.id] : current.filter((r) => r !== role.id),
                                      });
                                    }}
                                  />
                                  {role.name}
                                </label>
                              );
                            })}
                          </div>
                        )}
                        {employees.length > 0 && (
                          <div className="flex flex-wrap gap-3">
                            {employees.map((emp) => {
                              const selected = ((a.config.allowedEmployeeIds as string[]) ?? []).includes(emp.id);
                              return (
                                <label key={emp.id} className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={selected}
                                    onCheckedChange={(checked) => {
                                      const current = (a.config.allowedEmployeeIds as string[]) ?? [];
                                      updateActionConfig(i, {
                                        allowedEmployeeIds: checked ? [...current, emp.id] : current.filter((e) => e !== emp.id),
                                      });
                                    }}
                                  />
                                  {emp.name}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {a.type === "SEND_WEBHOOK" && (
                      <EntityCombobox
                        className="w-72"
                        options={webhooks.map((w) => ({ value: w.id, label: w.url }))}
                        value={(a.config.webhookId as string) || null}
                        onChange={(v) => updateActionConfig(i, { webhookId: v ?? "" })}
                        placeholder="Выберите вебхук"
                      />
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={addAction}>
                  Добавить действие
                </Button>
              </div>

              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={isPending || !name.trim() || actions.length === 0} onClick={handleCreate}>
                  Создать сценарий
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                  Отмена
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Сценарии ещё не настроены</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((r) => (
            <div key={r.id} className="rounded-md border p-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{r.name}</span>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">{DOCUMENT_TYPE_LABELS[r.documentType]}</Badge>
                    <Badge variant="secondary">{EVENT_TYPE_LABELS[r.eventType]}</Badge>
                    {r.conditions.map((c, i) => (
                      <Badge key={i} variant="outline">
                        {FIELD_LABELS[c.field]} {OPERATOR_LABELS[c.operator]} {resolveConditionValueLabel(r, c)}
                      </Badge>
                    ))}
                    {r.actions.map((a, i) => (
                      <Badge key={i}>
                        {a.type === "CREATE_RELATED_DOCUMENT" && "Создать документ"}
                        {a.type === "CREATE_NOTIFICATION" && "Уведомление"}
                        {a.type === "SEND_WEBHOOK" && "Вебхук"}
                      </Badge>
                    ))}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={r.isActive}
                        disabled={isPending}
                        onCheckedChange={(checked) => handleToggle(r.id, checked === true)}
                      />
                      Активен
                    </label>
                    <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => handleDelete(r.id)}>
                      <X className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
