// Marcas do Grupo DVA — lista fixa (não é semeada como tabela, já que o
// próprio documento do MVP não pede tela de gestão para isso, diferente dos
// Centros de Distribuição). Casada por LIKE contra vehicle_brands.name (banco
// antigo do PROCAR, cross-database — ver veiculos.service.ts).
export const MARCAS_DVA: string[] = ['Mercedes', 'Jeep', 'RAM', 'BYD', 'Dodge', 'Chrysler', 'Denza'];
