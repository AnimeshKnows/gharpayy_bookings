import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import NewBooking from "@/pages/new-booking";
import AdminBookingDetail from "@/pages/admin-booking-detail";
import TenantBookingDetail from "@/pages/tenant-booking-detail";
import TenantRequest from "@/pages/tenant-request";
import Insights from "@/pages/insights";
import Login from "@/pages/login";
import Settings from "@/pages/settings";

import { AuthProvider, useAuth } from "@/contexts/auth";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { teammate, isLoading, setupNeeded } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading...</div>
      </div>
    );
  }

  if (setupNeeded || !teammate) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      {/* Public tenant routes — no auth needed */}
      <Route path="/bookings/:id" component={TenantBookingDetail} />
      <Route path="/request" component={TenantRequest} />
      <Route path="/login" component={Login} />

      {/* Protected admin routes */}
      <Route path="/">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/bookings/new">
        {() => <ProtectedRoute component={NewBooking} />}
      </Route>
      <Route path="/bookings/:id/admin">
        {() => <ProtectedRoute component={AdminBookingDetail} />}
      </Route>
      <Route path="/insights">
        {() => <ProtectedRoute component={Insights} />}
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={Settings} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
