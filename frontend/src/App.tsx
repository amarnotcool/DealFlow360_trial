// Router shell for the internal workspace.

import { Navigate, Route, Routes } from 'react-router-dom';

import ApprovalDetail from './pages/internal/approvals/ApprovalDetail';
import ApprovalsList from './pages/internal/approvals/ApprovalsList';
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/quotations" replace />} />
      <Route path="/quotations" element={<QuotationsList />} />
      <Route path="/quotations/:id" element={<QuotationDetail />} />
      <Route path="/approvals" element={<ApprovalsList />} />
      <Route path="/approvals/:id" element={<ApprovalDetail />} />
      <Route path="/fulfillment" element={<FulfillmentList />} />
      <Route path="/fulfillment/:id" element={<FulfillmentDetail />} />
      <Route path="/subscriptions" element={<SubscriptionsList />} />
      <Route path="/subscriptions/:id" element={<SubscriptionDetail />} />
      <Route path="/invoices" element={<InvoicesList />} />
      <Route path="/invoices/:id" element={<InvoiceDetail />} />
      <Route path="/preview" element={<Preview />} />
      <Route path="/system" element={<SystemStatus />} />
      <Route path="*" element={<Navigate to="/quotations" replace />} />
    </Routes>
  );
}
