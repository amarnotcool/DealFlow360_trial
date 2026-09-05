// Router shell for the internal workspace.
//
// Every internal screen sits behind RequireAuth, and the screens a role has no
// business on sit behind RequireRole as well. The API enforces the same rules
// itself — these guards only keep the UI honest.

import { Navigate, Route, Routes } from 'react-router-dom';

import ApprovalDetail from './pages/internal/approvals/ApprovalDetail';
import ApprovalsList from './pages/internal/approvals/ApprovalsList';
import DealHealthDashboard from './pages/internal/deal-health/DealHealthDashboard';
import CustomerDetail from './pages/internal/customers/CustomerDetail';
import CustomersList from './pages/internal/customers/CustomersList';
import Login from './pages/auth/Login';
import FulfillmentDetail from './pages/internal/fulfillment/FulfillmentDetail';
import FulfillmentList from './pages/internal/fulfillment/FulfillmentList';
import InvoiceDetail from './pages/internal/invoices/InvoiceDetail';
import InvoicesList from './pages/internal/invoices/InvoicesList';
import ProductCatalog from './pages/internal/products/ProductCatalog';
import AdminReportingDashboard from './pages/internal/reports/AdminReportingDashboard';
import ProductDetail from './pages/internal/products/ProductDetail';
import QuotationDetail from './pages/internal/quotations/QuotationDetail';
import QuotationsList from './pages/internal/quotations/QuotationsList';
import SubscriptionDetail from './pages/internal/subscriptions/SubscriptionDetail';
import SubscriptionsList from './pages/internal/subscriptions/SubscriptionsList';
import UserDetail from './pages/internal/users/UserDetail';
import UsersList from './pages/internal/users/UsersList';
import WarehouseDetail from './pages/internal/warehouses/WarehouseDetail';
import WarehousesList from './pages/internal/warehouses/WarehousesList';
import Preview from './pages/Preview';
import SystemStatus from './pages/SystemStatus';
import PortalRoutes from './routes/portal-routes';
import { RequireAuth, RequireRole } from './routes/guards';
import { ADMIN_ONLY, APPROVALS_ROLES, BILLING_ROLES, REPORTING_ROLES } from './routes/access';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* The customer portal is its own surface, with its own session. */}
      <Route path="/portal/*" element={<PortalRoutes />} />

      <Route path="/" element={<Navigate to="/quotations" replace />} />

      <Route
        path="/quotations"
        element={
          <RequireAuth>
            <QuotationsList />
          </RequireAuth>
        }
      />
      <Route
        path="/quotations/:id"
        element={
          <RequireAuth>
            <QuotationDetail />
          </RequireAuth>
        }
      />

      <Route
        path="/approvals"
        element={
          <RequireRole allow={APPROVALS_ROLES}>
            <ApprovalsList />
          </RequireRole>
        }
      />
      <Route
        path="/approvals/:id"
        element={
          <RequireRole allow={APPROVALS_ROLES}>
            <ApprovalDetail />
          </RequireRole>
        }
      />

      <Route
        path="/fulfillment"
        element={
          <RequireAuth>
            <FulfillmentList />
          </RequireAuth>
        }
      />
      <Route
        path="/fulfillment/:id"
        element={
          <RequireAuth>
            <FulfillmentDetail />
          </RequireAuth>
        }
      />

      <Route
        path="/subscriptions"
        element={
          <RequireRole allow={BILLING_ROLES}>
            <SubscriptionsList />
          </RequireRole>
        }
      />
      <Route
        path="/subscriptions/:id"
        element={
          <RequireRole allow={BILLING_ROLES}>
            <SubscriptionDetail />
          </RequireRole>
        }
      />

      <Route
        path="/invoices"
        element={
          <RequireRole allow={BILLING_ROLES}>
            <InvoicesList />
          </RequireRole>
        }
      />
      <Route
        path="/invoices/:id"
        element={
          <RequireRole allow={BILLING_ROLES}>
            <InvoiceDetail />
          </RequireRole>
        }
      />

      {/* The catalogue is readable by everyone who builds quotes; only an
          admin sees the create and edit controls (specs.md §2). */}
      <Route
        path="/products"
        element={
          <RequireAuth>
            <ProductCatalog />
          </RequireAuth>
        }
      />
      <Route
        path="/products/:id"
        element={
          <RequireAuth>
            <ProductDetail />
          </RequireAuth>
        }
      />

      {/* The customer book is readable by everyone; reps and admins maintain it
          (specs.md §2), and the API enforces that on the write endpoints. */}
      <Route
        path="/customers"
        element={
          <RequireAuth>
            <CustomersList />
          </RequireAuth>
        }
      />
      <Route
        path="/customers/:id"
        element={
          <RequireAuth>
            <CustomerDetail />
          </RequireAuth>
        }
      />

      {/* Who can sign in, and as what, is admin-only in full. */}
      <Route
        path="/users"
        element={
          <RequireRole allow={ADMIN_ONLY}>
            <UsersList />
          </RequireRole>
        }
      />
      <Route
        path="/users/:id"
        element={
          <RequireRole allow={ADMIN_ONLY}>
            <UserDetail />
          </RequireRole>
        }
      />

      {/* Stock is readable by everyone who quotes from it; moving it is
          finance and admin work, which the API enforces on its own. */}
      <Route
        path="/warehouses"
        element={
          <RequireAuth>
            <WarehousesList />
          </RequireAuth>
        }
      />
      <Route
        path="/warehouses/:id"
        element={
          <RequireAuth>
            <WarehouseDetail />
          </RequireAuth>
        }
      />

      {/* The approvals desk watches deal health too (specs.md §2); a rep
          never sees the board. */}
      <Route
        path="/deal-health"
        element={
          <RequireRole allow={APPROVALS_ROLES}>
            <DealHealthDashboard />
          </RequireRole>
        }
      />

      {/* Analytics is manager, finance and admin work (specs.md §2); the API
          guards /reports with the same three roles. */}
      <Route
        path="/reports"
        element={
          <RequireRole allow={REPORTING_ROLES}>
            <AdminReportingDashboard />
          </RequireRole>
        }
      />

      <Route path="/preview" element={<Preview />} />
      <Route path="/system" element={<SystemStatus />} />
      <Route path="*" element={<Navigate to="/quotations" replace />} />
    </Routes>
  );
}
