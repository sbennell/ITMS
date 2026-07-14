import { Navigate } from 'react-router-dom';
import { PermissionFlag } from '../lib/api';
import { useAuth, firstAccessibleArea } from '../App';

export default function PermissionRoute({
  permission,
  children
}: {
  permission: PermissionFlag;
  children: React.ReactNode;
}) {
  const { hasPermission } = useAuth();

  if (hasPermission(permission)) {
    return <>{children}</>;
  }

  return <Navigate to={firstAccessibleArea(hasPermission) ?? '/settings'} replace />;
}
