// Router shell. Business screens land in the next step; for now the routes are
// the internal component gallery, placeholders behind the two enabled nav
// items, and a system card that keeps the step-5 /health slice wired.

import { Navigate, Route, Routes } from 'react-router-dom';

import ModulePlaceholder from './pages/ModulePlaceholder';
import Preview from './pages/Preview';
import SystemStatus from './pages/SystemStatus';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/preview" replace />} />
      <Route path="/preview" element={<Preview />} />
      <Route path="/quotations" element={<ModulePlaceholder title="Quotations" />} />
      <Route path="/approvals" element={<ModulePlaceholder title="Approvals" />} />
      <Route path="/system" element={<SystemStatus />} />
      <Route path="*" element={<Navigate to="/preview" replace />} />
    </Routes>
  );
}
