export type Perfil = 'operador' | 'admin';

// `centroDistribuicaoId` restringe o Operador ao centro de onde ele cadastra
// veículos (null = Admin, sem restrição).
export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  centroDistribuicaoId: number | null;
  centroDistribuicaoNome: string | null;
}
