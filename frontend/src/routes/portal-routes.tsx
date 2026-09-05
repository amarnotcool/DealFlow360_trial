// The customer portal's route subtree (CLAUDE.md rule 4).
//
// Mounted under /portal/* and guarded by the portal session alone: a staff
// token opens nothing here, and a signed-out visitor is sent to the portal's
// own login page.

import { Navigate, Route, Routes } from 'react-router-dom';

import Messages from '../pages/portal/Messages';
import Overview from '../pages/portal/Overview';
import MyQuotations from '../pages/portal/MyQuotations';
import NegotiationScreen from '../pages/portal/NegotiationScreen';
import PortalLogin from '../pages/portal/PortalLogin';
import Profile from '../pages/portal/Profile';
import { RequirePortalAuth } from './guards';

export default function PortalRoutes() {
  return (
    <Routes>
      <Route path="login" element={<PortalLogin />} />

      {/* The landing screen: where this customer's quotations stand. */}
      <Route
        index
        element={
          <RequirePortalAuth>
            <Overview />
          </RequirePortalAuth>
        }
      />

      <Route
        path="quotations"
        element={
          <RequirePortalAuth>
            <MyQuotations />
          </RequirePortalAuth>
        }
      />
      <Route
        path="quotations/:id"
        element={
          <RequirePortalAuth>
            <NegotiationScreen />
          </RequirePortalAuth>
        }
      />
      <Route
        path="messages"
        element={
          <RequirePortalAuth>
            <Messages />
          </RequirePortalAuth>
        }
      />
      <Route
        path="profile"
        element={
          <RequirePortalAuth>
            <Profile />
          </RequirePortalAuth>
        }
      />

      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
  );
}
