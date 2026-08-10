import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { onNaoAutorizado } from '../services/api';
import * as authService from '../services/auth.service';
import type { Usuario } from '../types';

// A sessão vive no cookie httpOnly (morre ao fechar o navegador). Além disso,
// expiramos por inatividade no cliente e o token expira no servidor.
const LIMITE_INATIVIDADE_MS = 30 * 60 * 1000; // 30 min sem interação → sai
const INTERVALO_HEARTBEAT_MS = 5 * 60 * 1000; // avanço do "tempo logado" + renovação do token
const INTERVALO_CHECAGEM_MS = 30 * 1000;

interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  // true = usuário autenticado mas ainda precisa concluir o primeiro acesso.
  precisaTrocarSenha: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  definirSenha: (senhaAtual: string, novaSenha: string) => Promise<void>;
  sair: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [precisaTrocarSenha, setPrecisaTrocarSenha] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const sair = useCallback((): void => {
    setUsuario(null);
    setPrecisaTrocarSenha(false);
    void authService.logout();
  }, []);

  // Restaura a sessão perguntando ao backend (o cookie httpOnly é enviado só).
  useEffect(() => {
    // Limpezas de versões antigas que guardavam sessão no navegador.
    localStorage.removeItem('procar.usuario');
    sessionStorage.removeItem('procar.sessao');

    authService
      .me()
      .then((dados) => {
        if (dados) {
          setUsuario(dados.usuario);
          setPrecisaTrocarSenha(dados.mustChangePassword);
        }
      })
      .finally(() => setCarregando(false));
  }, []);

  // 401 vindo de qualquer requisição = sessão expirada/revogada → limpa o estado.
  useEffect(() => {
    return onNaoAutorizado(() => {
      setUsuario(null);
      setPrecisaTrocarSenha(false);
    });
  }, []);

  async function entrar(email: string, senha: string): Promise<void> {
    const s = await authService.login(email, senha);
    setUsuario(s.usuario);
    setPrecisaTrocarSenha(s.mustChangePassword);
  }

  async function definirSenha(senhaAtual: string, novaSenha: string): Promise<void> {
    const { usuario: atualizado } = await authService.definirSenha(senhaAtual, novaSenha);
    setUsuario(atualizado);
    setPrecisaTrocarSenha(false);
  }

  // Mantém a última interação numa ref para o timer decidir expiração/heartbeat.
  const ultimaAtividadeRef = useRef(Date.now());

  // Enquanto logado: monitora interações para (a) expirar a sessão por
  // inatividade e (b) enviar o heartbeat que mede o uso e renova o token —
  // só quando houve atividade desde o último envio (não conta tela parada).
  useEffect(() => {
    if (!usuario) return;

    ultimaAtividadeRef.current = Date.now();
    let ultimoHeartbeat = Date.now();
    const marcarAtividade = () => {
      ultimaAtividadeRef.current = Date.now();
    };
    const eventos: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    eventos.forEach((e) => window.addEventListener(e, marcarAtividade, { passive: true }));

    void authService.registrarAtividade();

    const timer = window.setInterval(() => {
      const agora = Date.now();
      if (agora - ultimaAtividadeRef.current >= LIMITE_INATIVIDADE_MS) {
        sair();
        return;
      }
      if (
        agora - ultimoHeartbeat >= INTERVALO_HEARTBEAT_MS &&
        ultimaAtividadeRef.current > ultimoHeartbeat
      ) {
        ultimoHeartbeat = agora;
        void authService.registrarAtividade();
      }
    }, INTERVALO_CHECAGEM_MS);

    return () => {
      eventos.forEach((e) => window.removeEventListener(e, marcarAtividade));
      window.clearInterval(timer);
    };
  }, [usuario, sair]);

  const value = useMemo(
    () => ({ usuario, carregando, precisaTrocarSenha, entrar, definirSenha, sair }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usuario, carregando, precisaTrocarSenha, sair],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
