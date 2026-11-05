"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCrm } from "./crm-provider";
import { BarChart3, Building2, ChevronRight, Database, GitBranch, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, X } from "lucide-react";
import { dashboardClass as css } from "./dashboard-styles";

const navigation = [
  { href: "/", label: "Genel Bakış", icon: LayoutDashboard },
  { href: "/satis-firsatlari", label: "Satış Fırsatları", icon: GitBranch },
  { href: "/sirketler", label: "Şirketler", icon: Building2 },
  { href: "/veri-kalitesi", label: "Veri Kalitesi", icon: ShieldCheck },
  { href: "/veri-hazirlama", label: "Veri Hazırlama", icon: Database },
  { href: "/analizler", label: "Analizler", icon: BarChart3 },
  { href: "/ayarlar", label: "Ayarlar", icon: Settings },
];

function UserProfile() {
  return <div className={css("profile")}><span className={css("avatar")} aria-hidden="true">VA</span><div className={css("nav-text")}><strong>Demo kullanıcı</strong><small>Veri analisti</small></div></div>;
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { warning } = useCrm();
  const currentPage = navigation.find(item => item.href === pathname)?.label ?? "Genel Bakış";
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const desktopTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileOpen]);

  useEffect(() => {
    const viewport = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => { if (viewport.matches) drawer.current?.close(); };
    viewport.addEventListener("change", closeOnDesktop);
    return () => viewport.removeEventListener("change", closeOnDesktop);
  }, []);

  function navItems() {
    return navigation.map(({ label, icon: Icon, href }) => <Link key={label} href={href}
      className={css(`nav-item ${pathname === href ? "active" : ""}`)} title={collapsed ? label : undefined}
      aria-label={label} aria-current={pathname === href ? "page" : undefined}
      onClick={() => drawer.current?.close()}>
      <Icon size={20} aria-hidden="true"/><span className={css("nav-text")}>{label}</span>
    </Link>);
  }

  return <div className={css(`app-shell ${collapsed ? "sidebar-collapsed" : ""}`)} data-dashboard>
    <a className={css("skip-link")} href="#main">Ana içeriğe geç</a>
    <aside id="desktop-navigation" className={css("sidebar")} aria-label="Yan menü">
      <Link href="/" className={css("brand")} aria-label="PipelineIQ ana sayfa"><GitBranch size={24}/><span className={css("nav-text")}>PipelineIQ</span></Link>
      <nav aria-label="Ana menü">{navItems()}</nav>
      <div className={css("sidebar-bottom")}><UserProfile/></div>
    </aside>
    <dialog id="mobile-navigation" ref={drawer} className={css("mobile-drawer")} aria-labelledby="drawer-title"
      onClose={() => { setMobileOpen(false); (window.matchMedia("(min-width: 901px)").matches ? desktopTrigger : trigger).current?.focus(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) drawer.current?.close();
      }}>
      <div className={css("drawer-layout")}><div className={css("drawer-heading")}><span id="drawer-title" className={css("brand")}><GitBranch size={24}/>PipelineIQ</span><button type="button" className={css("icon-button")} aria-label="Menüyü kapat" onClick={() => drawer.current?.close()}><X size={20}/></button></div>
        <nav aria-label="Mobil ana menü">{navItems()}</nav><div className={css("sidebar-bottom")}><UserProfile/></div>
      </div>
    </dialog>
    <div className={css("main-shell")}>
      <header className={css("topbar")}><div className={css("topbar-start")}>
        <button ref={desktopTrigger} type="button" className={css("icon-button desktop-toggle")} aria-label={collapsed ? "Menüyü genişlet" : "Menüyü daralt"} aria-expanded={!collapsed} aria-controls="desktop-navigation" onClick={() => setCollapsed(value => !value)}>{collapsed ? <PanelLeftOpen size={20}/> : <PanelLeftClose size={20}/>}</button>
        <button ref={trigger} type="button" className={css("icon-button mobile-toggle")} aria-label="Menüyü aç" aria-haspopup="dialog" aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={() => { drawer.current?.showModal(); setMobileOpen(true); }}><Menu size={21}/></button>
        <nav aria-label="Sayfa konumu" className={css("breadcrumb")}><span>Çalışma alanı</span><ChevronRight size={14}/><span aria-current="page">{currentPage}</span></nav>
      </div><span className={css("demo-label")} title="Sentetik CRM verisi: tüm şirketler, kişiler ve ürünler kurgusaldır. Analiz tarihi 31.10.2026.">Sentetik veri</span></header>
      {warning && <div className={css("notice")} role="alert">{warning}</div>}
      {children}
    </div>
  </div>;
}
