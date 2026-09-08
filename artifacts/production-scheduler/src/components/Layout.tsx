import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, CalendarX, Sun, Moon, BookOpen, ClipboardList, History, ShieldCheck, LogOut, FileSpreadsheet, Gauge, CalendarClock } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useAuth, TIER_LABELS } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SyncBadge } from "@/sync/SyncBadge";
import { PresenceIndicator } from "@/sync/PresenceIndicator";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, can, logout } = useAuth();

  const navItems = [
    { href: "/commesse",   label: "Commesse",   icon: ClipboardList },
    { href: "/dashboard",  label: "Pannello",   icon: LayoutDashboard },
    { href: "/capacita",   label: "Capacità",   icon: Gauge },
    { href: "/turni",      label: "Turni",      icon: CalendarClock },
    { href: "/catalogo",   label: "Catalogo",   icon: BookOpen },
    { href: "/employees",  label: "Dipendenti", icon: Users },
    { href: "/festivita",  label: "Festività",  icon: CalendarX },
    ...(can("importData")  ? [{ href: "/import", label: "Importa",  icon: FileSpreadsheet }] : []),
    ...(can("viewAudit")   ? [{ href: "/audit",  label: "Registro", icon: History }] : []),
    ...(can("manageUsers") ? [{ href: "/utenti", label: "Utenti",   icon: ShieldCheck }] : []),
  ];

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-mono">
      <aside className="w-60 border-r border-border bg-sidebar shrink-0 flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex flex-col gap-1 min-w-0">
            <img src="/ialc-logo-blanco.png" alt="IALC serramenti" className="h-6 w-auto self-start" />
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground truncate">Pianificazione Produzione</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-8 h-8 p-0"
            onClick={toggleTheme}
            title={theme === "dark" ? "Tema chiaro" : "Tema scuro"}
            data-testid="button-toggle-theme"
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location === item.href ||
              (item.href === "/commesse" && (location === "/" || location.startsWith("/commesse") || location.startsWith("/orders")));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${isActive ? "bg-primary/20 text-primary font-bold" : "hover:bg-accent/30 hover:text-accent-foreground"} text-xs uppercase tracking-wider`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <PresenceIndicator />
        <SyncBadge />
        {user && (
          <div className="p-3 border-t border-border flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold truncate" data-testid="text-current-user">{user.displayName}</p>
              <p className="text-[10px] uppercase text-muted-foreground">{TIER_LABELS[user.tier]}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-8 h-8 p-0 shrink-0"
              onClick={logout}
              title="Esci"
              data-testid="button-logout"
            >
              <LogOut size={15} />
            </Button>
          </div>
        )}
      </aside>
      <main className="flex-1 overflow-auto flex flex-col bg-background">
        {children}
      </main>
    </div>
  );
}
