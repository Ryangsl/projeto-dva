import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { LoginPage } from './modules/auth/LoginPage';
import { PrimeiroAcessoPage } from './modules/auth/PrimeiroAcessoPage';
import { AlterarSenhaPage } from './modules/auth/AlterarSenhaPage';
import { VeiculoPage } from './modules/veiculos/VeiculoPage';

// Telas exclusivas do Admin em chunks separados: o OPERADOR — que é a maioria
// dos acessos e trabalha num tablet com internet ruim — nunca as abre, então
// não deve pagar o download delas. Login e cadastro de veículo continuam no
// bundle principal, por serem o caminho crítico de todos os perfis.
const MonitoramentoPage = lazy(() =>
  import('./modules/monitoramento/MonitoramentoPage').then((m) => ({ default: m.MonitoramentoPage })),
);
const CentrosPage = lazy(() =>
  import('./modules/centros/CentrosPage').then((m) => ({ default: m.CentrosPage })),
);
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
        {/* Cadastro de veículo é a tela principal do produto */}
        <Route path="/veiculos/novo" element={<VeiculoPage />} />
        {/* Monitoramento de veículos cadastrados (perfil admin) */}
        <Route
          path="/monitoramento"
          element={
            // fallback null (e não um spinner): o chunk vem da mesma origem e
            // resolve em milissegundos — um spinner só piscaria na tela.
            <Suspense fallback={null}>
              <MonitoramentoPage />
            </Suspense>
          }
        />
        {/* Gestão de centros de distribuição (perfil admin) */}
        <Route
          path="/centros"
          element={
            <Suspense fallback={null}>
              <CentrosPage />
            </Suspense>
          }
        />
        {/* Gerenciamento de usuários (perfil admin) */}
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
      <Route path="*" element={<Navigate to="/veiculos/novo" replace />} />
    </Routes>
  );
}
