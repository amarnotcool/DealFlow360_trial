// Router shell for the internal workspace.

import { Navigate, Route, Routes } from 'react-router-dom';

import ApprovalDetail from './pages/internal/approvals/ApprovalDetail';
import ApprovalsList from './pages/internal/approvals/ApprovalsList';
import QuotationDetail from './pages/internal/quotations/QuotationDetail';
import QuotationsList from './pages/internal/quotations/QuotationsList';
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
      <Route path="/preview" element={<Preview />} />
      <Route path="/system" element={<SystemStatus />} />
      <Route path="*" element={<Navigate to="/quotations" replace />} />
    </Routes>
  );
}
