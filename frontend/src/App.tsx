import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { LoginPage } from './modules/auth/LoginPage';
import { PrimeiroAcessoPage } from './modules/auth/PrimeiroAcessoPage';
import { AlterarSenhaPage } from './modules/auth/AlterarSenhaPage';
import { GuiaPage } from './modules/guia/GuiaPage';

// Telas de Gestor/Admin em chunks separados: o CONSULTOR — que é a maioria dos
// acessos e trabalha num tablet com internet ruim (§2 do CLAUDE.md) — nunca as
// abre, então não deve pagar o download delas. Login e guia continuam no bundle
// principal, porque são o caminho crítico do atendimento.
const UsoPage = lazy(() => import('./modules/gestor/UsoPage').then((m) => ({ default: m.UsoPage })));
const UsuariosPage = lazy(() =>
  import('./modules/usuarios/UsuariosPage').then((m) => ({ default: m.UsuariosPage })),
);

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Primeiro acesso: obrigatório antes de liberar o sistema (guarda própria). */}
      <Route path="/primeiro-acesso" element={<PrimeiroAcessoPage />} />
      <Route element={<ProtectedRoute />}>
        {/* Guia de atendimento é a tela principal do produto */}
        <Route path="/guia" element={<GuiaPage />} />
        {/* Monitoramento de uso por concessionária (perfil gestor/admin) */}
        <Route
          path="/gestor/uso"
          element={
            // fallback null (e não um spinner): o chunk vem da mesma origem e
            // resolve em milissegundos — um spinner só piscaria na tela.
            <Suspense fallback={null}>
              <UsoPage />
            </Suspense>
          }
        />
        {/* Gerenciamento de usuários (perfil gestor/admin) */}
        <Route
          path="/usuarios"
          element={
            <Suspense fallback={null}>
              <UsuariosPage />
            </Suspense>
          }
        />
        {/* Troca de senha voluntária (todos os perfis, inclusive Admin) */}
        <Route path="/minha-senha" element={<AlterarSenhaPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/guia" replace />} />
    </Routes>
  );
}
