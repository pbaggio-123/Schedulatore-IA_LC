import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Commesse from "@/pages/Commesse";
import CommessaDetail from "@/pages/CommessaDetail";
import Employees from "@/pages/Employees";
import Festivita from "@/pages/Festivita";
import Catalogo from "@/pages/Catalogo";
import Capacita from "@/pages/Capacita";
import Turni from "@/pages/Turni";
import Afan from "@/pages/Afan";
import AuditLog from "@/pages/AuditLog";
import Login from "@/pages/Login";
import Utenti from "@/pages/Utenti";
import Importa from "@/pages/Importa";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { SyncProvider } from "@/sync/SyncProvider";

const queryClient = new QueryClient();

function Router() {
  const { user, can } = useAuth();

  if (!user) return <Login />;

  return (
    <Switch>
      <Route path="/"                component={Commesse} />
      <Route path="/commesse"        component={Commesse} />
      <Route path="/commesse/:id"    component={CommessaDetail} />
      <Route path="/dashboard"       component={Dashboard} />
      <Route path="/capacita"        component={Capacita} />
      <Route path="/turni"           component={Turni} />
      <Route path="/afan"            component={Afan} />
      <Route path="/employees"       component={Employees} />
      <Route path="/festivita"       component={Festivita} />
      <Route path="/catalogo"        component={Catalogo} />
      {can("importData") && <Route path="/import" component={Importa} />}
      {can("viewAudit")  && <Route path="/audit"  component={AuditLog} />}
      {can("manageUsers") && <Route path="/utenti" component={Utenti} />}
      {/* Legacy routes */}
      <Route path="/orders"          component={Commesse} />
      <Route path="/orders/:id"      component={CommessaDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <SyncProvider>
            <AuthProvider>
              <Router />
            </AuthProvider>
          </SyncProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
