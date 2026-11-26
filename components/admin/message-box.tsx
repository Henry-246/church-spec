"use client";

// Message editor: text box, live character / SMS-unit counter, placeholder
// buttons and a preview personalised for a sample member.
import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { countSegments } from "@/lib/sms/segments";
import { PLACEHOLDERS, renderTemplate, unknownPlaceholders } from "@/lib/templates";

type Props = {
  name: string;
  value: string;
  onChange: (value: string) => void;
  churchName: string;
  sample?: { first_name: string; full_name: string } | null;
  label?: string;
  maxLength?: number;
};

export function MessageBox({ name, value, onChange, churchName, sample, label = "Message", maxLength = 918 }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const sampleValues = sample ?? { first_name: "Ama", full_name: "Ama Owusu" };
  const preview = renderTemplate(value, { ...sampleValues, church_name: churchName });
  const info = countSegments(preview);
  const unknown = unknownPlaceholders(value);

  function insert(text: string) {
    const el = ref.current;
    if (!el) return onChange(value + text);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs text-muted-foreground self-center">Insert:</span>
        {PLACEHOLDERS.map((p) => (
          <button key={p} type="button" onClick={() => insert(p)} className="rounded border px-2 py-0.5 font-mono text-xs hover:bg-muted">
            {p}
          </button>
        ))}
      </div>
      <Textarea
        ref={ref}
        id={name}
        name={name}
        rows={5}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Hi {first_name}, join us this Sunday at 8am…"
        required
      />
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {info.length} characters · <b className="text-foreground">{info.segments} SMS</b> per person · {info.remaining} left in this SMS
        </span>
        <span>{info.encoding === "GSM-7" ? "Standard characters (160 per SMS)" : "Special characters (70 per SMS)"}</span>
      </div>
      {info.encoding === "Unicode" && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          These characters make each SMS shorter (70 instead of 160): {info.unicodeChars.join(" ")}. Replace them (e.g. use
          straight quotes &apos; instead of curly ’, remove emoji) to save SMS credit.
        </p>
      )}
      {unknown.length > 0 && (
        <p className="text-xs text-destructive">
          Unknown placeholder{unknown.length > 1 ? "s" : ""}: {unknown.join(", ")}. Use only {PLACEHOLDERS.join(", ")}.
        </p>
      )}
      {value && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Example preview (using {sampleValues.full_name}):</div>
          <p className="whitespace-pre-wrap">{preview}</p>
        </div>
      )}
    </div>
  );
}
