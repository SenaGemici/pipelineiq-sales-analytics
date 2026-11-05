"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { dashboardClass as css } from "./dashboard-styles";
import styles from "./crm.module.css";

export function PageHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className={css("page-heading")}><div><h1>{title}</h1><p>{description}</p></div>{children && <div className={css("page-actions")}>{children}</div>}</div>;
}
export function SearchField({ value, onChange, label, placeholder }: { value: string; onChange: (value: string) => void; label: string; placeholder: string }) {
  return <label className={styles.search}><Search size={17}/><input type="search" aria-label={label} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}/>{value && <button type="button" className={css("icon-button")} aria-label="Aramayı temizle" onClick={() => onChange("")}><X size={15}/></button>}</label>;
}
export function Notice({ children }: { children: ReactNode }) {
  return <p role="status" className={styles.notice}>{children}</p>;
}
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
/** Büyük listeleri parça parça gösterir. Filtre değiştiğinde `resetKey` ile başa döner. */
export function usePaged<T>(items: T[], pageSize: number, resetKey: string) {
  const [state, setState] = useState({ key: resetKey, limit: pageSize });
  const limit = state.key === resetKey ? state.limit : pageSize;
  return { visible: items.slice(0, limit), hasMore: items.length > limit, remaining: items.length - limit,
    more: () => setState({ key: resetKey, limit: limit + pageSize }) };
}
export function ShowMore({ remaining, step, onClick, label = "kayıt" }: { remaining: number; step: number; onClick: () => void; label?: string }) {
  if (remaining <= 0) return null;
  return <button type="button" className={styles.showMore} onClick={onClick}>{Math.min(step, remaining).toLocaleString("tr-TR")} {label} daha göster <span>({remaining.toLocaleString("tr-TR")} kaldı)</span></button>;
}
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.body.style.overflow;
    const opener = document.activeElement as HTMLElement | null;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previous; opener?.focus(); };
  }, []);
  return <dialog ref={dialog} className={`${styles.modal} ${wide ? styles.wide : ""}`} aria-labelledby={id}
    // React StrictMode efekti kaldırıp yeniden kurar: temizlikteki close() olayı, diyalog yeniden açıldıktan sonra gelir.
    // Diyalog hâlâ açıksa bu olay kullanıcıdan gelmemiştir; yok sayılır. (Escape ile kapatmada open=false olur.)
    onClose={event => { if (!event.currentTarget.open) onClose(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <div className={styles.modalHeading}><h2 id={id}>{title}</h2><button className={css("icon-button")} type="button" aria-label="Paneli kapat" onClick={onClose}><X size={20}/></button></div>
    {children}
  </dialog>;
}
