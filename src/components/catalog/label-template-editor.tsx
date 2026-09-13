"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import JsBarcode from "jsbarcode";
import { Type, Barcode as BarcodeIcon, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { upsertLabelTemplate } from "@/actions/label-templates";
import {
  LABEL_FIELD_KEYS,
  LABEL_FIELD_LABELS,
  SAMPLE_LABEL_VALUES,
  type LabelElement,
  type LabelFieldKey,
} from "@/lib/label-template";

// On-screen editing scale only — the print/PDF path (template-label-
// renderer.tsx) uses raw `mm` CSS units directly, this is purely so the
// canvas is a comfortable size to drag things around on a screen.
const PX_PER_MM = 4;

interface LabelTemplateEditorProps {
  orgSlug: string;
  templateId: string | null;
  initialValues?: {
    name: string;
    widthMm: number;
    heightMm: number;
    elements: LabelElement[];
  };
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function BarcodePreview({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (svgRef.current) {
      JsBarcode(svgRef.current, value, { format: "EAN13", displayValue: false, margin: 0 });
    }
  }, [value]);
  return <svg ref={svgRef} className="h-full w-full" preserveAspectRatio="none" />;
}

export function LabelTemplateEditor({ orgSlug, templateId, initialValues }: LabelTemplateEditorProps) {
  const router = useRouter();
  const nameId = useId();
  const [name, setName] = useState(initialValues?.name ?? "");
  const [widthMm, setWidthMm] = useState(initialValues?.widthMm ?? 58);
  const [heightMm, setHeightMm] = useState(initialValues?.heightMm ?? 40);
  const [elements, setElements] = useState<LabelElement[]>(initialValues?.elements ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newFieldKey, setNewFieldKey] = useState<LabelFieldKey>("name");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ id: string; startPointerX: number; startPointerY: number; startX: number; startY: number } | null>(
    null,
  );

  const selected = elements.find((el) => el.id === selectedId) ?? null;

  function updateElement(id: string, patch: Partial<LabelElement>) {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el)));
  }

  function addElement(el: LabelElement) {
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  }

  function handleAddText() {
    addElement({ id: newId(), type: "text", text: "Текст", x: 2, y: 2, width: 30, height: 8, fontSize: 10 });
  }

  function handleAddField() {
    addElement({
      id: newId(),
      type: "field",
      field: newFieldKey,
      x: 2,
      y: 2,
      width: 40,
      height: 8,
      fontSize: 10,
    });
  }

  function handleAddBarcode() {
    addElement({ id: newId(), type: "barcode", x: 2, y: 2, width: Math.min(widthMm - 4, 40), height: 16, fontSize: 10 });
  }

  function handleDeleteSelected() {
    if (!selectedId) return;
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  }

  function handlePointerDown(e: React.PointerEvent, el: LabelElement) {
    e.stopPropagation();
    setSelectedId(el.id);
    dragState.current = { id: el.id, startPointerX: e.clientX, startPointerY: e.clientY, startX: el.x, startY: el.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragState.current;
    if (!drag) return;
    const el = elements.find((x) => x.id === drag.id);
    if (!el) return;
    const deltaMmX = (e.clientX - drag.startPointerX) / PX_PER_MM;
    const deltaMmY = (e.clientY - drag.startPointerY) / PX_PER_MM;
    const nextX = Math.min(Math.max(0, drag.startX + deltaMmX), Math.max(0, widthMm - el.width));
    const nextY = Math.min(Math.max(0, drag.startY + deltaMmY), Math.max(0, heightMm - el.height));
    updateElement(drag.id, { x: nextX, y: nextY });
  }

  function handlePointerUp() {
    dragState.current = null;
  }

  function renderElementContent(el: LabelElement) {
    if (el.type === "text") return el.text ?? "";
    if (el.type === "field" && el.field) return SAMPLE_LABEL_VALUES[el.field];
    if (el.type === "barcode") return null;
    return "";
  }

  function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError("Введите название шаблона");
      return;
    }
    setIsSaving(true);
    (async () => {
      const result = await upsertLabelTemplate(orgSlug, templateId, { name, widthMm, heightMm, elements });
      setIsSaving(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Шаблон сохранён");
      router.push(`/${orgSlug}/catalog`);
    })();
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex flex-1 flex-col gap-4">
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 pt-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={nameId}>Название шаблона</Label>
              <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} className="w-56" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Ширина, мм</Label>
              <Input
                type="number"
                min={10}
                max={500}
                value={widthMm}
                onChange={(e) => setWidthMm(Number(e.target.value) || 1)}
                className="w-24"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Высота, мм</Label>
              <Input
                type="number"
                min={10}
                max={500}
                value={heightMm}
                onChange={(e) => setHeightMm(Number(e.target.value) || 1)}
                className="w-24"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleAddText}>
            <Type className="size-4" />+ Текст
          </Button>
          <div className="flex items-center gap-1">
            <Select value={newFieldKey} items={LABEL_FIELD_LABELS} onValueChange={(v) => setNewFieldKey(v as LabelFieldKey)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LABEL_FIELD_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {LABEL_FIELD_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={handleAddField}>
              <Plus className="size-4" />+ Поле
            </Button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleAddBarcode}>
            <BarcodeIcon className="size-4" />+ Штрихкод
          </Button>
        </div>

        <div
          ref={canvasRef}
          className="relative select-none border border-dashed border-gray-400 bg-white"
          style={{ width: widthMm * PX_PER_MM, height: heightMm * PX_PER_MM }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={() => setSelectedId(null)}
        >
          {elements.map((el) => (
            <div
              key={el.id}
              onPointerDown={(e) => handlePointerDown(e, el)}
              className={`absolute cursor-move overflow-hidden border text-black ${
                selectedId === el.id ? "border-primary border-2" : "border-gray-300"
              }`}
              style={{
                left: el.x * PX_PER_MM,
                top: el.y * PX_PER_MM,
                width: el.width * PX_PER_MM,
                height: el.height * PX_PER_MM,
                fontSize: el.fontSize,
                fontWeight: el.bold ? 700 : 400,
              }}
            >
              {el.type === "barcode" ? (
                <BarcodePreview value={SAMPLE_LABEL_VALUES.barcode} />
              ) : (
                renderElementContent(el)
              )}
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Сохраняем..." : "Сохранить"}
          </Button>
          <Button type="button" variant="outline" render={<a href={`/${orgSlug}/catalog`} />}>
            Отмена
          </Button>
        </div>
      </div>

      <Card className="w-full lg:w-72">
        <CardHeader>
          <CardTitle className="text-base">Свойства элемента</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Выберите элемент на холсте</p>
          ) : (
            <>
              {selected.type === "text" && (
                <div className="flex flex-col gap-2">
                  <Label>Текст</Label>
                  <Input
                    value={selected.text ?? ""}
                    onChange={(e) => updateElement(selected.id, { text: e.target.value })}
                  />
                </div>
              )}
              {selected.type === "field" && (
                <div className="flex flex-col gap-2">
                  <Label>Поле</Label>
                  <Select
                    value={selected.field}
                    items={LABEL_FIELD_LABELS}
                    onValueChange={(v) => updateElement(selected.id, { field: v as LabelFieldKey })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LABEL_FIELD_KEYS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {LABEL_FIELD_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label>X, мм</Label>
                  <Input
                    type="number"
                    value={selected.x}
                    onChange={(e) => updateElement(selected.id, { x: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Y, мм</Label>
                  <Input
                    type="number"
                    value={selected.y}
                    onChange={(e) => updateElement(selected.id, { y: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Ширина, мм</Label>
                  <Input
                    type="number"
                    min={1}
                    value={selected.width}
                    onChange={(e) => updateElement(selected.id, { width: Number(e.target.value) || 1 })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Высота, мм</Label>
                  <Input
                    type="number"
                    min={1}
                    value={selected.height}
                    onChange={(e) => updateElement(selected.id, { height: Number(e.target.value) || 1 })}
                  />
                </div>
              </div>
              {selected.type !== "barcode" && (
                <div className="flex flex-col gap-1">
                  <Label>Размер шрифта</Label>
                  <Input
                    type="number"
                    min={4}
                    value={selected.fontSize}
                    onChange={(e) => updateElement(selected.id, { fontSize: Number(e.target.value) || 4 })}
                  />
                </div>
              )}
              {selected.type !== "barcode" && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.bold ?? false}
                    onCheckedChange={(checked) => updateElement(selected.id, { bold: checked === true })}
                  />
                  Жирный
                </label>
              )}
              <Button type="button" variant="destructive" size="sm" onClick={handleDeleteSelected}>
                <Trash2 className="size-4" />
                Удалить элемент
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
