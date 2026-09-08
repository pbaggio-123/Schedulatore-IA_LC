import { useState } from "react";
import { LogIn, ShieldAlert } from "lucide-react";
import { useAuth, DEMO_ACCOUNTS, TIER_LABELS } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!login(username.trim(), password)) setError(true);
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-background text-foreground font-mono">
      <div className="w-full max-w-md p-8 border border-border rounded-lg bg-card flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <img src="/ialc-logo-blanco.png" alt="IALC serramenti" className="h-9 w-auto self-start" />
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Pianificazione Produzione · Passione e innovazione</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-xs uppercase text-muted-foreground">Nome utente</label>
          <Input
            value={username}
            onChange={e => { setUsername(e.target.value); setError(false); }}
            placeholder="es. demo-admin"
            autoFocus
            data-testid="input-username"
          />
          <label className="text-xs uppercase text-muted-foreground">Password</label>
          <Input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(false); }}
            placeholder="••••••••"
            data-testid="input-password"
          />
          {error && (
            <div className="flex items-center gap-2 text-destructive text-xs">
              <ShieldAlert size={14} /> Credenziali non valide.
            </div>
          )}
          <Button type="submit" className="mt-2" data-testid="button-login">
            <LogIn size={15} className="mr-2" /> Entra
          </Button>
        </form>

        <div className="border-t border-border pt-4">
          <p className="text-[11px] uppercase text-muted-foreground mb-1">Account demo (password = nome utente)</p>
          <p className="text-[10px] text-muted-foreground mb-2">Per <span className="text-foreground">modificare</span> (turni, commesse, fasi) usa Pianificatore o Amministratore · Visualizzatore = sola lettura.</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => { setUsername(a.username); setPassword(a.password); setError(false); }}
                className="text-left text-[11px] border border-border rounded p-2 hover:bg-accent/30 transition-colors"
                data-testid={`button-demo-${a.username}`}
              >
                <span className="font-bold block">{a.username}</span>
                <span className="text-muted-foreground">{TIER_LABELS[a.tier]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
