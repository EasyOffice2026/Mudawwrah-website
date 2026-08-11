import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../store/auth';

export default function AdminOnly({ children }) {
  const { user } = useAuth();
  const { slug } = useParams();
  if (user && user.role !== 'ADMIN') return <Navigate to={`/r/${slug}/admin`} replace />;
  return children;
}
