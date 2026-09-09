import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/auth';

export default function AdminOnly({ children }) {
  const { user } = useAuth();
  if (user && user.role !== 'ADMIN') return <Navigate to="/admin" replace />;
  return children;
}
