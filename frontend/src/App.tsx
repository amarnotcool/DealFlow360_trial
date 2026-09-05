// Router shell for the internal workspace.
//
// Every internal screen sits behind RequireAuth, and the screens a role has no
// business on sit behind RequireRole as well. The API enforces the same rules
// itself — these guards only keep the UI honest.

import { Navigate, Route, Routes } from 'react-router-dom';

import ApprovalDetail from './pages/internal/approvals/ApprovalDetail';
import ApprovalsList from './pages/internal/approvals/ApprovalsList';
import Login from './pages/auth/Login';
import FulfillmentDetail from './pages/internal/fulfillment/FulfillmentDetail';
import FulfillmentList from './pages/internal/fulfillment/FulfillmentList';
import InvoiceDetail from './pages/internal/invoices/InvoiceDetail';
import InvoicesList from './pages/internal/invoices/InvoicesList';
import QuotationDetail from './pages/internal/quotations/QuotationDetail';
import QuotationsList from './pages/internal/quotations/QuotationsList';
import SubscriptionDetail from './pages/internal/subscriptions/SubscriptionDetail';
import SubscriptionsList from './pages/internal/subscriptions/SubscriptionsList';
import Preview from './pages/Preview';
import SystemStatus from './pages/SystemStatus';
import PortalRoutes from './routes/portal-routes';
import { RequireAuth, RequireRole } from './routes/guards';
import { APPROVALS_ROLES, BILLING_ROLES } from './routes/access';

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

      <Route path="/preview" element={<Preview />} />
      <Route path="/system" element={<SystemStatus />} />
      <Route path="*" element={<Navigate to="/quotations" replace />} />
    </Routes>
  );
}
