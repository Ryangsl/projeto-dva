export type Perfil = 'operador' | 'admin';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
}
