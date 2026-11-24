import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './store/AppContext';
import { ToastProvider, Button } from './components/ui';
import { UpdateProvider } from './store/UpdateContext';
import { Layout } from './components/Layout';
import { LoginPage, Splash } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { BillingPage } from './pages/Billing';
import { BillsPage } from './pages/Bills';
import { BillDetailPage } from './pages/BillDetail';
import { CustomersPage } from './pages/Customers';
import { CustomerDetailPage } from './pages/CustomerDetail';
import { ProductsPage } from './pages/Products';
import { PaymentsPage } from './pages/Payments';
import { ExpensesPage } from './pages/Expenses';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { AboutPage } from './pages/About';
import { ShieldAlert } from 'lucide-react';

function AccessDenied({ message }: { message: string }) {
  const { signOut } = useApp();
  return (
    <div className="access-denied">
      <div className="card">
        <div className="card-body" style={{ textAlign: 'center', padding: 28 }}>
          <ShieldAlert size={34} color="var(--red)" style={{ marginBottom: 10 }} />
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>Access not authorised</h2>
          <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 16 }}>{message}</p>
          <Button onClick={() => void signOut()}>Sign in with another account</Button>
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const { user, authLoading, ready, seeding, accessDenied } = useApp();
  if (authLoading) return <Splash label="Checking your session…" />;
  if (!user) return <LoginPage />;
  if (!ready) return <Splash label="Opening your business account…" />;
  if (accessDenied) return <AccessDenied message={accessDenied} />;
  if (seeding) return <Splash label="Preparing products & frame rates…" />;
  return (
    <UpdateProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/billing/:id" element={<BillingPage />} />
          <Route path="/bills" element={<BillsPage />} />
          <Route path="/bills/:id" element={<BillDetailPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </UpdateProvider>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </AppProvider>
    </HashRouter>
  );
}
