"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ResourceCover } from "./resource-cover";

export type PickerResource = {
  id: string;
  title: string;
  subjectId: string;
  subjectTitle?: string | null;
  publisher?: string | null;
  grade?: string | null;
  coverUrl?: string | null;
  chapters?: { id: string; title: string }[];
};

export function ResourcePicker({
  resources,
  value,
  onChange,
  name,
  placeholder = "منبع را انتخاب کنید…",
  disabled = false,
  ariaLabel = "انتخاب منبع",
  className = "",
  emptyOption,
  id,
}: {
  resources: PickerResource[];
  value: string;
  onChange: (resourceId: string) => void;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  emptyOption?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const selected = resources.find((resource) => resource.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".resource-picker-popover")) return;
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return resources;
    return resources.filter((resource) =>
      [resource.title, resource.subjectTitle, resource.publisher, resource.grade]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [query, resources]);

  return (
    <div className={`resource-picker ${className}`.trim()} ref={rootRef}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        type="button"
        id={id}
        className="resource-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={(event) => {
          if (open) {
            setOpen(false);
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const width = Math.min(420, window.innerWidth - 16);
          const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
          const estimated = 390;
          const openUp = rect.bottom + estimated > window.innerHeight;
          setAnchor({
            top: openUp ? Math.max(8, rect.top - estimated - 4) : rect.bottom + 4,
            left,
            width,
          });
          setOpen(true);
        }}
      >
        {selected ? (
          <>
            <ResourceCover
              coverUrl={selected.coverUrl}
              title={selected.title}
              subjectTitle={selected.subjectTitle}
              size="xs"
            />
            <span className="resource-picker-trigger-text">
              <strong>{selected.title}</strong>
              <small>
                {[selected.subjectTitle, selected.publisher, selected.grade]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
          </>
        ) : (
          <span className="resource-picker-placeholder">{placeholder}</span>
        )}
        <span className="resource-picker-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && anchor
        ? createPortal(
        <div
          className="resource-picker-popover"
          role="dialog"
          aria-label={ariaLabel}
          style={{
            position: "fixed",
            top: anchor.top,
            left: anchor.left,
            width: anchor.width,
            insetInline: "auto",
          }}
        >
          <input
            className="resource-picker-search"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جستجوی کتاب، درس یا ناشر…"
            aria-label="جستجوی منبع"
          />
          <div className="resource-picker-list" id={listId} role="listbox">
            {emptyOption && !query.trim() ? (
              <button
                type="button"
                role="option"
                aria-selected={value === ""}
                className={`resource-picker-option ${value === "" ? "is-active" : ""}`.trim()}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <span className="resource-picker-empty-option" aria-hidden>
                  ⊆
                </span>
                <span className="resource-picker-option-text">
                  <strong>{emptyOption}</strong>
                </span>
              </button>
            ) : null}
            {filtered.length === 0 ? (
              <div className="resource-picker-empty">منبعی پیدا نشد.</div>
            ) : (
              filtered.map((resource) => {
                const active = resource.id === value;
                return (
                  <button
                    key={resource.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`resource-picker-option ${active ? "is-active" : ""}`.trim()}
                    onClick={() => {
                      onChange(resource.id);
                      setOpen(false);
                    }}
                  >
                    <ResourceCover
                      coverUrl={resource.coverUrl}
                      title={resource.title}
                      subjectTitle={resource.subjectTitle}
                      size="sm"
                    />
                    <span className="resource-picker-option-text">
                      <strong>{resource.title}</strong>
                      <small>
                        {[resource.subjectTitle, resource.publisher, resource.grade]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                      {resource.chapters?.length ? (
                        <small className="muted">
                          {resource.chapters.length.toLocaleString("fa-IR")} فصل
                        </small>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )
        : null}
    </div>
  );
}
