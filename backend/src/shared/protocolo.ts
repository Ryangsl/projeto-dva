import { randomInt } from 'node:crypto';

// Protocolo do cadastro de veículo: AAAA + MMDD + 4 caracteres aleatórios
// (ex.: 20260810X7K2) — um recibo curto e único da operação, gerado sempre no
// servidor (nunca aceito do cliente). Mesmo alfabeto sem caracteres ambíguos
// (0/O, 1/l/I) de `gerarSenhaTemporaria`, pelo mesmo motivo: precisa ser
// legível/ditável sem erro no balcão.
//
// Vive em `shared/` (e não no módulo veiculos) porque o `db:setup` também
// precisa dela para preencher o protocolo de veículos cadastrados antes desta
// coluna existir — evita carregar o pool de conexões da aplicação dentro do
// script de setup, que usa a própria conexão.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function trecho(tamanho: number): string {
  let s = '';
  for (let i = 0; i < tamanho; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

export function gerarProtocolo(data: Date = new Date()): string {
  const ano = String(data.getFullYear());
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}${mes}${dia}${trecho(4)}`;
}
