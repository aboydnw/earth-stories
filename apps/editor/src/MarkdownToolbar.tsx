import type { RefObject } from "react";
import {
  LinkSimple,
  ListBullets,
  ListNumbers,
  TextB,
  TextH,
  TextItalic,
} from "@phosphor-icons/react";

type TextareaRef = RefObject<HTMLTextAreaElement | null>;

function wrapSelection(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (value: string) => void,
  prefix: string,
  suffix: string,
  placeholder: string,
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end) || placeholder;
  onChange(
    `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`,
  );
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(
      start + prefix.length,
      start + prefix.length + selected.length,
    );
  });
}

function insertList(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (value: string) => void,
  ordered: boolean,
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end) || "List item";
  const items = selected
    .split("\n")
    .map((line, index) => `${ordered ? `${index + 1}.` : "-"} ${line}`);
  const needsBreak = start > 0 && !value.slice(0, start).endsWith("\n\n");
  const insertion = `${needsBreak ? "\n\n" : ""}${items.join("\n")}`;
  onChange(`${value.slice(0, start)}${insertion}${value.slice(end)}`);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(
      start + insertion.length,
      start + insertion.length,
    );
  });
}

export function MarkdownToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: TextareaRef;
  value: string;
  onChange: (value: string) => void;
}) {
  const actions = [
    ["Bold", <TextB key="bold" weight="bold" />, "**", "**", "bold text"],
    ["Italic", <TextItalic key="italic" />, "*", "*", "italic text"],
    ["Heading", <TextH key="heading" weight="bold" />, "## ", "", "Heading"],
    ["Link", <LinkSimple key="link" />, "[", "](url)", "link text"],
  ] as const;
  return (
    <div
      className="markdown-toolbar"
      role="toolbar"
      aria-label="Markdown formatting"
    >
      {actions.map(([label, icon, prefix, suffix, placeholder]) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => {
            if (textareaRef.current)
              wrapSelection(
                textareaRef.current,
                value,
                onChange,
                prefix,
                suffix,
                placeholder,
              );
          }}
        >
          {icon}
        </button>
      ))}
      <button
        type="button"
        aria-label="Bulleted list"
        title="Bulleted list"
        onClick={() =>
          textareaRef.current &&
          insertList(textareaRef.current, value, onChange, false)
        }
      >
        <ListBullets />
      </button>
      <button
        type="button"
        aria-label="Numbered list"
        title="Numbered list"
        onClick={() =>
          textareaRef.current &&
          insertList(textareaRef.current, value, onChange, true)
        }
      >
        <ListNumbers />
      </button>
      <span>Markdown supported</span>
    </div>
  );
}
