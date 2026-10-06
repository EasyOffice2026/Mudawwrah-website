import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../store/auth';

/**
 * Everything in the admin except the order desk. A branch account works one
 * branch's orders and sold-out list only, so any other page — typed in, or
 * left in the address bar from someone else's session — sends it to Orders.
 */
export default function StaffOnly({ children }) {
  const { user } = useAuth();
  const { slug } = useParams();
  if (user && user.role === 'BRANCH') return <Navigate to={`/r/${slug}/admin/orders`} replace />;
  return children ?? <Outlet />;
}
