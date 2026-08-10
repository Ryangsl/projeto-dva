// Filtro de marcas exibidas no guia. A FIPE tem dezenas de marcas; aqui
// limitamos às principais/populares para manter o guia leve e relevante.
// Cada item é casado contra vehicle_brands.name com LIKE (case-insensitive),
// então trechos parciais funcionam mesmo com os prefixos da FIPE
// (ex.: 'VolksWagen' casa 'VW - VolksWagen'; 'Chevrolet' casa 'GM - Chevrolet').
// Para incluir/remover marcas, basta editar esta lista.
export const MARCAS_PRINCIPAIS: string[] = [
  'VolksWagen',
  'BMW',
  'Mercedes',
  'Renault',
  'Peugeot',
  'Fiat',
  'Chevrolet',
  'Ford',
  'Toyota',
  'Honda',
  'Hyundai',
  'Jeep',
  'Nissan',
  'Audi',
];
