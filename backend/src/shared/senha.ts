import { randomInt } from 'node:crypto';

// Senha temporária legível para comunicar no balcão (ex.: "k3fh-9mpq"). Sem
// caracteres ambíguos (0/O, 1/l/I) para não gerar erro ao ditar. Nunca é
// persistida em texto puro — só o hash vai para o banco, e o valor gerado
// volta uma única vez a quem executou a operação.
//
// Vive em `shared/` (e não no módulo `usuarios`) porque o script de setup do
// banco também precisa dela: importá-la de lá arrastaria o pool de conexões
// para dentro do `db:setup`, que usa a própria conexão.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

// `randomInt` do node:crypto — aleatoriedade criptográfica, não Math.random:
// é uma credencial, ainda que de vida curta.
function trecho(tamanho: number): string {
  let s = '';
  for (let i = 0; i < tamanho; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

export function gerarSenhaTemporaria(): string {
  return `${trecho(4)}-${trecho(4)}`;
}
