export type Perfil = 'consultor' | 'gestor' | 'admin';

// `marca` restringe o Consultor à sua concessionária (null = sem restrição).
// `marcas` são as lojas administradas pelo Gestor (pode ser mais de uma;
// vazio para Consultor/Admin).
export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  marca: string | null;
  marcas: string[];
}
