import { createContext, useContext, Component, ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from './components/Layout';
import PermissionRoute from './components/PermissionRoute';
import Login from './pages/Login';
import AssetList from './pages/AssetList';
import AssetDetail from './pages/AssetDetail';
import AssetForm from './pages/AssetForm';
import BulkAddAssets from './pages/BulkAddAssets';
import StudentList from './pages/StudentList';
import StudentDetail from './pages/StudentDetail';
import Settings from './pages/Settings';
import Stocktake from './pages/Stocktake';
import Network from './pages/Network';
import Reports from './pages/Reports';
import { api, User, PermissionFlag } from './lib/api';

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  hasPermission: (flag: PermissionFlag) => boolean;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  hasPermission: () => false
});

export function useAuth() {
  return useContext(AuthContext);
}

// Ordered list of top-level areas and the permission each needs; used both for the "/"
// redirect and as the fallback landing spot when a restricted user hits a blocked route.
const AREA_ROUTES: Array<{ path: string; flag: PermissionFlag }> = [
  { path: '/assets', flag: 'canAccessAssets' },
  { path: '/students', flag: 'canAccessStudents' },
  { path: '/stocktake', flag: 'canAccessStocktake' },
  { path: '/network', flag: 'canAccessReports' },
  { path: '/reports', flag: 'canAccessReports' }
];

export function firstAccessibleArea(hasPermission: AuthContextType['hasPermission']): string | null {
  return AREA_ROUTES.find((r) => hasPermission(r.flag))?.path ?? null;
}

class ErrorBoundary extends Component<{ children: ReactNode }> {
  constructor(props: { children: ReactNode }) {
    super(props);
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ['auth-status'],
    queryFn: api.getAuthStatus,
    retry: false
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!data?.authenticated || !data?.user) {
    return <Navigate to="/login" replace />;
  }

  const isAdmin = data.user.role === 'ADMIN';
  const user = data.user;
  const authValue: AuthContextType = {
    user,
    isAdmin,
    hasPermission: (flag) => isAdmin || !!user[flag]
  };

  return (
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>
  );
}

function AreaRedirect() {
  const { hasPermission } = useAuth();
  return <Navigate to={firstAccessibleArea(hasPermission) ?? '/settings'} replace />;
}

export default function App() {
  console.log('App component rendering');

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<AreaRedirect />} />
                  <Route path="/assets" element={<PermissionRoute permission="canAccessAssets"><AssetList /></PermissionRoute>} />
                  <Route path="/assets/new" element={<PermissionRoute permission="canAccessAssets"><AssetForm /></PermissionRoute>} />
                  <Route path="/assets/bulk-add" element={<PermissionRoute permission="canAccessAssets"><BulkAddAssets /></PermissionRoute>} />
                  <Route path="/assets/:id" element={<PermissionRoute permission="canAccessAssets"><AssetDetail /></PermissionRoute>} />
                  <Route path="/assets/:id/edit" element={<PermissionRoute permission="canAccessAssets"><AssetForm /></PermissionRoute>} />
                  <Route path="/students" element={<PermissionRoute permission="canAccessStudents"><StudentList /></PermissionRoute>} />
                  <Route path="/students/:id" element={<PermissionRoute permission="canAccessStudents"><StudentDetail /></PermissionRoute>} />
                  <Route path="/stocktake" element={<PermissionRoute permission="canAccessStocktake"><Stocktake /></PermissionRoute>} />
                  <Route path="/network" element={<PermissionRoute permission="canAccessReports"><Network /></PermissionRoute>} />
                  <Route path="/reports" element={<PermissionRoute permission="canAccessReports"><Reports /></PermissionRoute>} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}
