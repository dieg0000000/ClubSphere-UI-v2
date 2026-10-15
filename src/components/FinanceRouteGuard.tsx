import { Navigate, useLocation } from 'react-router-dom';
import { useFinanceModuleEnabled } from '../hooks/useFinanceModuleEnabled';

export function FinanceRouteGuard({ children }: { children: React.ReactNode }) {
  const { enabled, loading } = useFinanceModuleEnabled();
  const location = useLocation();

  if (loading) return null;
  if (!enabled) {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('finance_module_redirect_toast', 'Le module Finances est désactivé pour ce club.');
    }
    return <Navigate to="/dashboard" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
