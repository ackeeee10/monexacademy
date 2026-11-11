"use client";

import { useTranslations } from "next-intl";

import { Chip } from "@/components/ui/choice";

type Option = { id: string; name: string };

type MultiPickerProps = {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  max: number;
  label: string;
};

/** Chip grid for picking several items (categories, skills). */
export function MultiPicker({ options, value, onChange, max, label }: MultiPickerProps) {
  const t = useTranslations("Onboarding");
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : value.length >= max ? value : [...value, id]);

  return (
    <fieldset className="space-y-3">
      <legend className="flex w-full items-center justify-between text-sm font-medium text-text">
        {label}
        <span className="tabular text-xs font-normal text-muted">{t("selected", { count: value.length })}</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.id} selected={value.includes(o.id)} onToggle={() => toggle(o.id)}>
            {o.name}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}
