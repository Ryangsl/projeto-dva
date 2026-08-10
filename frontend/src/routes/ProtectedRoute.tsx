import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Bloqueia rotas para não autenticados e força o primeiro acesso: enquanto o
// usuário não trocar a senha temporária, é desviado para /primeiro-acesso.
export function ProtectedRoute() {
  const { usuario, carregando, precisaTrocarSenha } = useAuth();
  if (carregando) return null;
  if (!usuario) return <Navigate to="/login" replace />;
  if (precisaTrocarSenha) return <Navigate to="/primeiro-acesso" replace />;
  return <Outlet />;
}
