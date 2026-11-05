"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { dashboardClass as css } from "./dashboard-styles";

export function InfoTooltip({ title, children }: { title: string; children: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelClose() {
    if (timer.current) clearTimeout(timer.current);
  }

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return <span ref={container} className={css("help-tooltip")}
    onMouseEnter={() => { cancelClose(); setOpen(true); }}
    onMouseLeave={() => { cancelClose(); timer.current = setTimeout(() => { if (document.activeElement !== button.current) setOpen(false); }, 150); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}
    onKeyDown={event => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}>
    <button ref={button} type="button" className={css("info-button")} aria-label={`${title} nasıl hesaplanır?`}
      aria-describedby={open ? id : undefined} aria-expanded={open}
      onFocus={() => setOpen(true)} onClick={() => setOpen(true)}><CircleHelp size={15}/></button>
    {open && <span id={id} role="tooltip" className={css("tooltip-content")}>{children}</span>}
  </span>;
}
