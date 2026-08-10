import type { Connection } from 'mysql2/promise';

// Seed do conteúdo do Guia de Atendimento a partir do MANUAL DE VENDAS PROCAR
// (V1/2026 — Setor de cuidado e proteção): roteiros por setor/canal/banco,
// serviços com preços e garantias, regras de oferta, argumentos por cor,
// contorno de objeções e dicas de ouro.
//
// Adaptações do manual para o sistema (texto mantido fiel no restante):
// - "Hugo" → {cliente}; "Corolla" → {modelo}; "Toyota" → {fabricante};
//   "Karol" → "(seu nome)" (o consultor fala o próprio nome).
// - O "Argumento por cores" vive na coluna `cores.argumento` e entra nos
//   templates via placeholder {argumento_cor}.
// - Valores (6x de R$ ...) ficam nos cards de oportunidade (regras/serviços);
//   a etapa "Valor" do roteiro orienta a consultar o card da proteção escolhida.
//
// Idempotente: detecta o conteúdo do manual pelo serviço marcador; se o banco
// tiver apenas o conteúdo antigo do MVP (seed genérico), ele é substituído.

const SETOR_NOVOS = 'Novos';
const SETOR_RECEM = 'Novos - Recém retirado';
const SETOR_SEMINOVOS = 'Seminovos';
const SETOR_OFICINA = 'Oficina';
const SETOR_FUNILARIA = 'Funilaria';

const SERVICO_MARCADOR = 'Coating Cerâmico de Pintura (Q2 e CanCoat)';

// ---------------------------------------------------------------------------
// Cores + argumento por cor (seção "Argumento por cores" do manual)
// ---------------------------------------------------------------------------
const ARG_PRETO =
  '{cliente}, você já teve carro nessa cor? Os donos de carro preto sabem o quanto ele é lindo, imponente, mas também o quanto ele é exigente — um simples paninho para secar pode acabar sendo uma grande dor de cabeça, porque ele mostra mais os riscos e as manchas.';
const ARG_VIBRANTE =
  '{cliente}, você já teve carro nessa cor? Cores vibrantes como o {cor} sofrem muito mais com a oxidação solar do que as outras cores.';
const ARG_BRANCO =
  '{cliente}, a cor branca é super elegante, mas sem proteção o sol e a poluição fazem o verniz oxidar, deixando o carro amarelado. O coating cerâmico bloqueia os raios UV, garantindo que seu carro continue branco puro por anos, como se tivesse acabado de sair da concessionária.';
const ARG_CINZA_PRATA =
  "{cliente}, a cor cinza/prata é uma cor funcional. O perigo é que ela 'disfarça' a sujeira, e isso faz com que agentes corrosivos fiquem mais tempo sobre a pintura. O coating cria uma camada protetora impermeável, impedindo que essa sujeira 'invisível' penetre e destrua o brilho do seu verniz. Além disso, o coating cerâmico destaca os pigmentos metálicos da pintura: faz o seu carro parecer que foi fundido em metal líquido, com um brilho cristalino que essa cor sozinha nunca alcançaria.";

const CORES: [nome: string, hex: string, argumento: string][] = [
  ['Preto', '#111418', ARG_PRETO],
  ['Branco', '#f4f5f7', ARG_BRANCO],
  ['Prata', '#c3c7cc', ARG_CINZA_PRATA],
  ['Cinza', '#5a6472', ARG_CINZA_PRATA],
  ['Vermelho', '#c0392b', ARG_VIBRANTE],
  ['Azul', '#2c5aa0', ARG_VIBRANTE],
  ['Verde', '#2e7d4f', ARG_VIBRANTE],
  ['Amarelo', '#e0b31d', ARG_VIBRANTE],
];

// ---------------------------------------------------------------------------
// Serviços (preços e garantias do manual; preço do Coating de Pintura varia
// por setor e por isso fica no argumento da regra, não na descrição)
// ---------------------------------------------------------------------------
const SERVICOS: [nome: string, selo: string, descricao: string][] = [
  [
    'Combo Full de Proteção',
    'Proteção completa',
    'Coating de Pintura + proteção dos bancos + Coating de Plásticos + Coating de Vidros. Garantia e durabilidade: 3 anos (pintura) e 1 ano (bancos). 6x de R$ 777,00 ou 5% de desconto à vista.',
  ],
  [
    SERVICO_MARCADOR,
    'Pintura protegida',
    'Camada de proteção cerâmica sobre a pintura e o verniz original de fábrica: riscos superficiais, fezes de pássaro, seiva de árvore, chuva ácida, sol e maresia. Garantia e durabilidade: 3 anos (Q2) e 1 ano (CanCoat).',
  ],
  [
    'Coating de Couro',
    'Interior premium',
    'Blindagem do couro contra manchas, água, abrasões, desgastes e o ressecamento dos raios UV. Garantia e durabilidade: 1 ano. 6x de R$ 160,00 ou 5% de desconto à vista.',
  ],
  [
    'Impermeabilização de Tecidos',
    'Bancos protegidos',
    'Líquidos não penetram no tecido: sem manchas, marcas ou odores. Produto de alta qualidade e não inflamável. Garantia de 6 meses e durabilidade de 1 ano. 6x de R$ 93,00 ou 5% de desconto à vista.',
  ],
  [
    'Higienização Interna',
    'Novo de novo',
    'Limpeza profunda de bancos, teto, colunas, carpete, painel e porta-malas com extratora e produtos específicos, eliminando ácaros, fungos e bactérias. 6x de R$ 93,00 ou 5% de desconto à vista.',
  ],
];

// ---------------------------------------------------------------------------
// Blocos de texto do pitch de Coating (repetidos pelo manual em cada cenário)
// ---------------------------------------------------------------------------
const COATING_O_QUE_E =
  "O nosso Coating de Pintura é uma camada de proteção cerâmica que vai revestir a pintura e o verniz original de fábrica, que é único e vem apenas uma vez. Não sei se você sabe, {cliente}, mas hoje em dia a tinta dos automóveis é à base d'água, então acaba sendo mais sensível e mais suscetível aos desgastes diários.";

const COATING_PROTECOES =
  'Então o coating vai proteger contra os temidos riscos superficiais que acontecem muito no dia a dia — as maçanetas também sofrem bastante por conta do contato das unhas —, protege das fezes de pássaros e da seiva de árvore, que em questão de minutos queimam o verniz original de fábrica e deixam marcas esbranquiçadas, da chuva ácida, do sol e da maresia, que danificam muito a pintura dos veículos. O coating cria uma barreira de sacrifício que impede que esses ácidos cheguem ao verniz original, e ele causa a hidrofobia: é como se o seu carro ficasse com a função autolimpante. Vou te dar um exemplo para você entender como funciona: se jogar barro sobre o seu {modelo}, ele vai deslizar e ficar uma camada superficial de poeira, de fácil remoção. Não precisa usar produtos químicos como intercap e solupan para limpar — que são altamente prejudiciais para o verniz —, para lavar é apenas água e shampoo e seu carro está com brilho novamente.';

const COATING_BRILHO =
  'Além de todas essas proteções, é como se o carro vivesse encerado, com um brilho excepcional. {cliente}, o Coating de Pintura é a única forma de congelar esse estado de perfeição do {modelo} zero e permanecer com esse brilho de showroom espelhado.';

const BANCOS_TECIDO =
  'E como o seu {modelo} veio com os bancos em tecido, não podemos vacilar. Já deixei no jeito aqui a impermeabilização. Sabe aquele café ou água que pode cair sem querer? Com a proteção, o líquido nem penetra: fica flutuando sobre a superfície e é só retirar com um papelzinho ou passar um pano por cima que o banco continua novo, sem manchas, sem marcas e sem odores indesejáveis.';

const BANCOS_COURO =
  'E como o seu {modelo} veio com os bancos em couro, não podemos vacilar. Vamos aplicar o Coating de Couro. Sabe aquele café ou água que pode cair sem querer? Com a proteção, o líquido nem penetra: fica flutuando sobre a superfície e é só retirar com um papelzinho ou passar um pano por cima que o banco continua novo, sem manchas, sem marcas e sem odores indesejáveis. O couro absorve muita oleosidade, mas o coating vai criar uma barreira protetora para o couro não rachar, não ressecar e não ter proliferação de fungos e bactérias, manter a cor original e proteger dos raios UV, que ressecam com facilidade o couro.';

const PLASTICOS_EXTERNOS =
  'Nos plásticos externos vamos aplicar o Coating de Plásticos, para não ficarem esbranquiçados pelo sol. Sabe aquela cor acinzentada que começa a aparecer depois de alguns dias de uso? Acontece muito por conta da oxidação e dos produtos químicos que usam para lavar os veículos. Além de proteger a saturação da cor preta dos plásticos, o seu {modelo} já não terá mais que ser lavado com esses produtos químicos.';

const VIDROS =
  'E os vidros ganham uma repelência total à chuva. Em velocidade, você nem precisa usar o limpador, porque a água escorre para as laterais: aumenta sua segurança e visibilidade em más condições climáticas — mais segurança para você e todos os ocupantes do veículo —, além de aumentar a vida útil da palheta, por remover o atrito da sujeira.';

const REVENDA_COMBO =
  'Com esse combo você garante que, daqui a 2 ou 3 anos, o estado de conservação esteja idêntico ao de um carro zero. No momento da avaliação, o primeiro ponto a ser avaliado é o estado de conservação e de pintura. O seu {modelo} vai se destacar de todos os outros que estão para venda e aumentar o valor de revenda.';

const FECHAMENTO_98 =
  'Por isso, {cliente}, 98% dos nossos clientes realizam essa proteção antes de retirar o carro da loja, porque agora é o momento ideal para proteger seu {modelo} antes que apareçam as primeiras imperfeições. É como comprar um celular novo de última geração: nós não saímos da loja sem a película e a capinha para proteger, certo? Agora imagine não proteger o seu patrimônio — chega a ser loucura, né? rsrsrs. Seu {modelo} já está no setor de preparação para entrega e eu já consigo incluir no cronograma de hoje para você retirar seu veículo segunda-feira com a pintura e os bancos totalmente protegidos. O Coating tem garantia e durabilidade de 3 anos (e 1 ano CanCoat), 1 ano para os bancos, e excelência {fabricante} que você já conhece! Podemos seguir com a aplicação?';

// ---------------------------------------------------------------------------
// Roteiro (etapas filtradas por setor/canal/banco; NULL = qualquer)
// ---------------------------------------------------------------------------
type Etapa = {
  ordem: number;
  setor: string | null;
  canal: 'presencial' | 'telefone' | null;
  banco: 'tecido' | 'couro' | null;
  titulo: string;
  instrucao: string;
  frase: string;
};

const INSTRUCAO_TOM =
  'O tom precisa ser entusiasmado, mas sem parecer "vendedor de telemarketing" — o segredo é ser especialista de cuidados. Sorria enquanto fala: o "sorriso na voz" transmite confiança e simpatia. Não fale muito rápido para não parecer ansioso em vender; use pausas para o cliente processar as informações. Deixe o cliente responder após cada frase.';

const ETAPAS: Etapa[] = [
  // ---------- NOVOS ----------
  {
    ordem: 10,
    setor: SETOR_NOVOS,
    canal: 'presencial',
    banco: null,
    titulo: 'Abertura e parabéns',
    instrucao: INSTRUCAO_TOM,
    frase:
      'Boa tarde {cliente}, tudo bem? Meu nome é (seu nome), sou responsável pelo setor de cuidados e proteção aqui da {fabricante}. Antes de mais nada, parabéns pelo seu carro novo! (deixe o cliente responder) Você fez uma escolha excelente, o carro está fantástico! (deixe o cliente responder)',
  },
  {
    ordem: 10,
    setor: SETOR_NOVOS,
    canal: 'telefone',
    banco: null,
    titulo: 'Abertura e parabéns',
    instrucao: INSTRUCAO_TOM + ' O "sorriso na voz" transmite confiança do outro lado da linha.',
    frase:
      'Boa tarde {cliente}, tudo bem? Quem está falando é (seu nome) da {fabricante}. Antes de mais nada, parabéns pelo seu carro novo! (deixe o cliente responder) Passei agora no setor de preparação de entrega e vi seu {modelo} — você fez uma escolha excelente, o carro está fantástico! (deixe o cliente responder) {cliente}, nós já iniciamos a preparação para entrega do seu veículo, seu {modelo} está maravilhoso e estou agilizando tudo para a entrega.',
  },
  {
    ordem: 20,
    setor: SETOR_NOVOS,
    canal: null,
    banco: null,
    titulo: 'Elogio à cor e gancho da proteção',
    instrucao: 'Faça a pausa na fala para o cliente responder.',
    frase:
      'A cor do seu {modelo} é linda — de todas as cores é a mais imponente, né {cliente}? (pausa na fala) E para que ele continue nesse estado de perfeição, nós realizamos nos carros 0km o Coating de Pintura, porque qualquer poeirinha ou lavagem mal feita no dia a dia acaba tirando aquele espelhamento de showroom que ele tá agora.',
  },
  {
    ordem: 30,
    setor: SETOR_NOVOS,
    canal: null,
    banco: null,
    titulo: 'O que é o Coating de Pintura',
    instrucao: 'Explique com calma — aqui você é a especialista, não a vendedora.',
    frase: COATING_O_QUE_E,
  },
  {
    ordem: 40,
    setor: SETOR_NOVOS,
    canal: null,
    banco: null,
    titulo: 'Proteções do Coating',
    instrucao:
      'Use o exemplo do barro para o cliente visualizar a hidrofobia. Se sua cidade for praiana, entre a fundo na argumentação da maresia.',
    frase: COATING_PROTECOES + ' ' + COATING_BRILHO,
  },
  {
    ordem: 50,
    setor: SETOR_NOVOS,
    canal: null,
    banco: 'tecido',
    titulo: 'Proteção dos bancos (tecido)',
    instrucao: 'Conecte a proteção dos bancos ao dia a dia do cliente (café, água, crianças).',
    frase: BANCOS_TECIDO,
  },
  {
    ordem: 50,
    setor: SETOR_NOVOS,
    canal: null,
    banco: 'couro',
    titulo: 'Proteção dos bancos (couro)',
    instrucao: 'Conecte a proteção dos bancos ao dia a dia do cliente (café, água, suor, jeans).',
    frase: BANCOS_COURO,
  },
  {
    ordem: 60,
    setor: SETOR_NOVOS,
    canal: null,
    banco: null,
    titulo: 'Plásticos externos e vidros',
    instrucao: 'Complete o Combo Full: plásticos e vidros fecham a proteção do carro inteiro.',
    frase: PLASTICOS_EXTERNOS + ' ' + VIDROS,
  },
  {
    ordem: 70,
    setor: SETOR_NOVOS,
    canal: null,
    banco: null,
    titulo: 'Valorização na revenda e fechamento',
    instrucao: 'Dê o momento de resposta ao cliente, com a pausa em silêncio.',
    frase: REVENDA_COMBO + ' ' + FECHAMENTO_98,
  },

  // ---------- NOVOS - RECÉM RETIRADO (30/60 dias) ----------
  {
    ordem: 10,
    setor: SETOR_RECEM,
    canal: null,
    banco: null,
    titulo: 'Abertura — momento de ouro',
    instrucao: 'Ligue em tom de voz feliz e entusiasmada.',
    frase:
      'Boa tarde {cliente}, aqui é (seu nome) da {fabricante}, tudo bem? Notei que seu {modelo} completou seus primeiros 30/60 dias de estrada! Como ele ainda está com o aspecto de novo, este é o momento de ouro para realizar a proteção. Proteger agora economiza muito dinheiro e tempo no futuro.',
  },
  {
    ordem: 20,
    setor: SETOR_RECEM,
    canal: null,
    banco: null,
    titulo: 'Verniz ainda íntegro',
    instrucao: 'Reforce que agora o serviço é mais rápido e preserva a originalidade.',
    frase:
      "O verniz do seu carro ainda está íntegro. O coating cerâmico cria uma camada de revestimento sobre a pintura que evita que fezes de pássaros, seiva de árvores e o sol manchem o carro permanentemente. O carro fica com brilho de vitrine e a sujeira não 'gruda' — você vai lavar o carro na metade do tempo.",
  },
  {
    ordem: 30,
    setor: SETOR_RECEM,
    canal: null,
    banco: 'couro',
    titulo: 'Bancos de couro aos 60 dias',
    instrucao: 'Mostre a urgência: o desgaste do couro já começou.',
    frase:
      'O couro novo é fosco e macio. Com 60 dias de uso, ele começa a absorver suor e a tinta das roupas (jeans), ficando brilhoso e gorduroso. O Coating impede a transferência de cor e mantém o toque aveludado original, evitando rachaduras precoces.',
  },
  {
    ordem: 30,
    setor: SETOR_RECEM,
    canal: null,
    banco: 'tecido',
    titulo: 'Bancos de tecido sem proteção',
    instrucao: 'Mostre o risco de manchas permanentes.',
    frase:
      "Uma única mancha de líquido em um banco sem proteção pode se tornar permanente ou gerar mau cheiro. Derramou algo? O líquido 'flutua' sobre o tecido — é só remover com um papel. Paz de espírito total no dia a dia.",
  },
  {
    ordem: 40,
    setor: SETOR_RECEM,
    canal: null,
    banco: null,
    titulo: 'Agendamento',
    instrucao: 'Ofereça datas concretas (quinta ou sexta) para fechar a agenda.',
    frase:
      'Como seu carro ainda não apresenta imperfeições profundas, conseguimos aplicar o coating sem a necessidade de polimento corretivo pesado, o que torna o serviço mais rápido e mantém a originalidade do seu verniz de fábrica. Tenho uma vaga na nossa agenda técnica para esta quinta ou sexta. Vamos garantir que ele continue com cara de 0km por mais 2 ou 3 anos?',
  },

  // ---------- OFICINA ----------
  {
    ordem: 10,
    setor: SETOR_OFICINA,
    canal: null,
    banco: null,
    titulo: 'Checklist no veículo',
    instrucao:
      'LEVE O CLIENTE ATÉ O VEÍCULO e mostre os pontos anotados do checklist — isso te traz domínio sobre a situação.',
    frase:
      '{cliente}, realizei o checklist do seu carro e preciso que você me acompanhe até ele para finalizarmos a revisão.',
  },
  {
    ordem: 20,
    setor: SETOR_OFICINA,
    canal: null,
    banco: null,
    titulo: 'Diagnóstico da pintura',
    instrucao: 'Faça o cliente tocar na pintura e enxergar as marcas.',
    frase:
      '{cliente}, seu carro está com alguns riscos na maçaneta, e aqui no capô tem algumas marcas de chuva ácida — consegue ver? Por conta dessa oxidação a pintura fica porosa, passa a mão aqui para você sentir... Seu carro acaba ficando sem brilho e sem a proteção do verniz. Você já tinha notado como essas marcas tiram o aspecto de novo do seu carro?',
  },
  {
    ordem: 30,
    setor: SETOR_OFICINA,
    canal: null,
    banco: null,
    titulo: 'Proposta: restaurar e proteger',
    instrucao: 'Apresente o processo em três passos: descontaminação → polimento técnico → Coating.',
    frase:
      'Aqui na {fabricante} nós temos um setor específico para deixar o seu carro novo de novo e com a valorização dele em alta e em dia. No seu carro o ideal é realizar o Coating de Pintura: vamos iniciar descontaminando a pintura para remover as impurezas que estão no verniz (excesso de sujeira), depois será feito o polimento técnico para remover todas as imperfeições (riscos e marcas superficiais, amenizando as mais profundas se houver) e finalizamos com o Coating para revestimento e proteção.',
  },
  {
    ordem: 40,
    setor: SETOR_OFICINA,
    canal: null,
    banco: null,
    titulo: 'Proteções do Coating',
    instrucao:
      'Se sua cidade for praiana, entre a fundo na argumentação da maresia. Use o exemplo do barro.',
    frase:
      COATING_O_QUE_E +
      ' ' +
      COATING_PROTECOES +
      " Então o que fazemos aqui não é apenas dar brilho, é colocar uma camada de sacrifício. Se cair uma gota de seiva de árvore ou fezes de pássaro no sol, ela queima o verniz original em minutos — com o Coating, quem sofre o dano é a proteção, não o seu patrimônio. É como comprar um celular de última geração: não saímos da loja sem uma película para proteger a tela. Vamos deixar o seu carro novo de novo e aumentar a valorização do seu veículo na hora da troca ou revenda.",
  },
  {
    ordem: 50,
    setor: SETOR_OFICINA,
    canal: null,
    banco: 'couro',
    titulo: 'Diagnóstico e proteção do couro',
    instrucao:
      'Mostre no banco o brilho de oleosidade e os vincos de tensão. Documente o antes e depois.',
    frase:
      'Você já notou que o banco do seu {modelo} está com um aspecto mais brilhante? Isso acontece porque nosso corpo libera naturalmente oleosidade e suor todos os dias. Como o couro é um material orgânico, ele absorve essa gordura. Esse brilho que estamos vendo não é limpeza: é excesso de oleosidade que, se não for removida e o couro hidratado, vai acabar ressecando e rachando o banco, porque essa gordura é absorvida pelas fibras do couro. Está vendo essas linhas de expressão aqui no banco? Elas são vincos de tensão: como o couro está com excesso de oleosidade e perdendo a hidratação natural, ele começa a ficar rígido. Se não limpar e reidratar agora, esse vinco vai virar uma rachadura real, resultando na perda do couro e na desvalorização do seu {modelo}. Vamos fazer uma limpeza interna detalhada de todo o interior do veículo (bancos, teto, carpete, painel, volante, porta-malas), removendo todos os pontos de sujeira e oleosidade, tirando esse aspecto acinzentado dos bancos e igualando a cor original de fábrica — e após isso aplicamos o Coating de Couro. Você vai sentir a diferença no toque do painel, sem aquela sensação gordurosa e, principalmente, no cheiro de ambiente renovado.',
  },
  {
    ordem: 50,
    setor: SETOR_OFICINA,
    canal: null,
    banco: 'tecido',
    titulo: 'Higienização interna',
    instrucao: 'Mostre as manchas no estofamento. Documente o antes e depois.',
    frase:
      "{cliente}, notei que ele acumulou uma sujeira com o tempo, o que é super comum no dia a dia, mas isso acaba afetando o conforto e até a saúde de quem está dentro. Para deixar o interior com aquele aspecto de carro novo de novo, o ideal seria realizar a higienização interna. Eu identifiquei alguns pontos principais — está vendo essas manchinhas? Na verdade elas não são só superficiais, então precisamos remover de dentro para fora: só sai com extratora e produtos específicos. O teto e as colunas precisam de uma limpeza manual detalhada para remover fuligem e odores, e para finalizar aplicamos um produto para eliminar ácaros, fungos e bactérias que ficam escondidos nos estofamentos. O meu objetivo aqui não é só limpar, é devolver o prazer de você dirigir. Vou documentar o processo de 'antes e depois' para você ver a cor real do seu interior aparecendo — garanto que visualmente será outro carro!",
  },
  {
    ordem: 60,
    setor: SETOR_OFICINA,
    canal: null,
    banco: null,
    titulo: 'Fechamento com a revisão',
    instrucao: 'Dê o momento de resposta ao cliente, com a pausa em silêncio.',
    frase:
      'Lembra de quando você retirou o {modelo} 0km? É assim que vamos deixar o seu carro: novo de novo. O Coating tem garantia e durabilidade de 1 ano e excelência {fabricante} que você já conhece! Conciliamos com a sua revisão para te entregar hoje às 17:00 — podemos seguir com a aplicação?',
  },

  // ---------- FUNILARIA ----------
  {
    ordem: 10,
    setor: SETOR_FUNILARIA,
    canal: null,
    banco: null,
    titulo: 'Abertura — notícia excelente',
    instrucao: 'Ligue em tom de voz feliz e entusiasmada. Espere a resposta do cliente.',
    frase:
      'Boa tarde {cliente}, aqui é (seu nome) da {fabricante}. Tudo bem? Estou te ligando com uma notícia excelente: seu carro já está na fase final de montagem e ficou impecável! Imagino que você esteja ansioso para ter ele de volta na garagem, né? (espere a resposta) Meu contato é justamente para garantir que ele saia daqui melhor do que entrou.',
  },
  {
    ordem: 20,
    setor: SETOR_FUNILARIA,
    canal: null,
    banco: null,
    titulo: 'Pintura nova × pintura antiga',
    instrucao: 'Este é o argumento central da funilaria: igualar o brilho do carro todo.',
    frase:
      "Quando fazemos um reparo de funilaria, a peça nova vem com o brilho original de fábrica, enquanto o restante do carro já sofreu com o tempo, sol, chuva, marcas e riscos superficiais — o que é natural por conta do uso diário do veículo. Para que não fique aquela diferença visual que acaba 'denunciando' que o carro foi batido, nós realizamos o coating cerâmico. O nosso Coating de Pintura é uma camada de proteção cerâmica que vai revestir a pintura nova e a antiga, igualando o brilho do carro todo ao de um carro novo!",
  },
  {
    ordem: 30,
    setor: SETOR_FUNILARIA,
    canal: null,
    banco: null,
    titulo: 'Proteções do Coating',
    instrucao: 'Use o exemplo do barro para o cliente visualizar a hidrofobia.',
    frase: COATING_PROTECOES,
  },
  {
    ordem: 40,
    setor: SETOR_FUNILARIA,
    canal: null,
    banco: null,
    titulo: 'Fechamento',
    instrucao: 'Dê o momento de resposta ao cliente, com a pausa em silêncio.',
    frase:
      'Com o coating, você garante que, daqui a 1 ou 2 anos, a pintura esteja conservada. No momento da avaliação para venda, o primeiro ponto a ser avaliado é o estado de conservação e de pintura. Por isso, {cliente}, 98% dos nossos clientes realizam essa proteção antes de retirar o carro da loja, porque agora é o momento ideal para proteger e aumentar a valorização do seu {modelo}. É o cuidado final para o seu carro não ter nenhuma desvalorização e você nem lembrar que um dia ele precisou de funilaria. Seu {modelo} já está no setor de preparação para entrega e eu já consigo incluir no cronograma de hoje para você retirar seu veículo com a pintura protegida. O Coating tem garantia e durabilidade de 3 anos (e 1 ano CanCoat) e excelência {fabricante} que você já conhece! Podemos seguir com a aplicação?',
  },

  // ---------- SEMINOVOS ----------
  {
    ordem: 10,
    setor: SETOR_SEMINOVOS,
    canal: null,
    banco: null,
    titulo: 'Abertura e parabéns',
    instrucao: 'Ligue em tom de voz feliz e entusiasmada. Deixe o cliente responder.',
    frase:
      'Boa tarde {cliente}, tudo bem? Quem está falando é (seu nome) da {fabricante}. Antes de mais nada, parabéns pelo seu carro novo! (deixe o cliente responder) Passei agora no setor de preparação de entrega e vi seu {modelo} — você fez uma escolha excelente, o carro está fantástico! (deixe o cliente responder) {cliente}, nós já iniciamos a preparação para entrega do seu veículo, seu {modelo} está maravilhoso e estou agilizando tudo para a entrega.',
  },
  {
    ordem: 20,
    setor: SETOR_SEMINOVOS,
    canal: null,
    banco: null,
    titulo: 'Novo ciclo — a analogia da casa nova',
    instrucao: 'O gatilho do seminovo é apagar o vestígio do dono anterior.',
    frase:
      'Como você está iniciando um novo ciclo com este carro, meu papel é garantir que ele seja entregue no nível máximo de excelência. Sabe quando a gente compra uma casa nova? Mesmo que ela esteja ótima, a gente gosta de fazer aquele capricho, uma pintura especial ou um detalhamento, para deixar tudo com o nosso toque pessoal e protegido antes de mudar. Com o carro é a mesma coisa! E para deixar seu carro com a sua cara e acabar com qualquer vestígio do dono anterior, eu recomendo o nosso coating de pintura!',
  },
  {
    ordem: 30,
    setor: SETOR_SEMINOVOS,
    canal: null,
    banco: null,
    titulo: 'O Coating de Pintura e suas proteções',
    instrucao: 'Use o exemplo do barro para o cliente visualizar a hidrofobia.',
    frase: COATING_O_QUE_E + ' ' + COATING_PROTECOES + ' ' + COATING_BRILHO,
  },
  {
    ordem: 40,
    setor: SETOR_SEMINOVOS,
    canal: null,
    banco: 'couro',
    titulo: 'Higienização + Coating de Couro',
    instrucao: 'Proteção "hospitalar": remover o vestígio do dono anterior é o argumento-chave.',
    frase:
      'E como o seu {modelo} veio com os bancos em couro, não podemos vacilar. Vamos fazer uma higienização detalhada em todo o interior do seu {modelo} (teto, carpete, painel, volante, porta-malas) para remover qualquer vestígio do dono anterior. É como se a gente passasse uma camada de proteção hospitalar no couro: fica muito mais fácil desinfetar e garantir que você e sua família estejam em um ambiente 100% higienizado e protegido. E finalizamos aplicando o Coating de Couro: sabe aquele café ou água que pode cair sem querer? Com a proteção, o líquido nem penetra, fica flutuando sobre a superfície e é só retirar com um papelzinho que o banco continua novo, sem manchas e sem odores. O couro absorve muita oleosidade, mas o coating cria uma barreira para o couro não rachar, não ressecar e não ter proliferação de fungos e bactérias, mantendo a cor original e protegido dos raios solares.',
  },
  {
    ordem: 50,
    setor: SETOR_SEMINOVOS,
    canal: null,
    banco: null,
    titulo: 'Fechamento',
    instrucao: 'Dê o momento de resposta ao cliente, com a pausa em silêncio.',
    frase:
      'Com o coating, você garante que, daqui a 1 ou 2 anos, a pintura esteja conservada. No momento da avaliação, o primeiro ponto a ser avaliado é o estado de conservação e de pintura — o seu {modelo} vai se destacar de todos os outros que estão para venda e aumentar o valor de revenda. Por isso, {cliente}, 98% dos nossos clientes realizam essa proteção antes de retirar o carro da loja. O objetivo é que, ao retirar o carro, você sinta que está estreando um veículo novo de verdade e com a sua identidade. Seu {modelo} já está no setor de preparação para entrega e eu já consigo incluir no cronograma de hoje para você retirar seu veículo segunda-feira com a pintura e os bancos totalmente protegidos. O Coating tem garantia e durabilidade de 3 anos (e 1 ano CanCoat), 1 ano para os bancos, e excelência {fabricante} que você já conhece! Podemos seguir com a aplicação?',
  },

  // ---------- ETAPAS GLOBAIS (todos os setores) ----------
  {
    ordem: 80,
    setor: null,
    canal: null,
    banco: null,
    titulo: 'Argumento pela cor',
    instrucao:
      'Munição extra: use o argumento específico da cor escolhida quando precisar reforçar a necessidade da proteção.',
    frase: '{argumento_cor}',
  },
  {
    ordem: 90,
    setor: null,
    canal: null,
    banco: null,
    titulo: 'Valor e formas de pagamento',
    instrucao:
      'Só informe o valor quando o cliente perguntar. Se pedir o valor à vista, diga o valor integral e trabalhe com sua margem de desconto. Trabalhe com a cortesia do coating de para-brisa caso precise para o fechamento.',
    frase:
      'O valor para proteger seu {modelo} fica em 6x (veja o valor da proteção escolhida nas oportunidades ao lado) ou à vista consigo te dar 5% de desconto. Qual dessas opções você prefere para já deixarmos o carro pronto para a sua entrega?',
  },
];

// ---------------------------------------------------------------------------
// Regras de oferta: setor/banco → serviço + argumento (com preço do manual)
// ---------------------------------------------------------------------------
type RegraSeed = {
  prioridade: number;
  setor: string | null;
  banco: 'tecido' | 'couro' | null;
  servico: string;
  argumento: string;
};

const REGRAS: RegraSeed[] = [
  // NOVOS
  {
    prioridade: 6,
    setor: SETOR_NOVOS,
    banco: 'tecido',
    servico: 'Combo Full de Proteção',
    argumento:
      'Combo Full para o seu {modelo}: Coating de Pintura + impermeabilização dos bancos em tecido + Coating de Plásticos + Coating de Vidros. Com esse combo você garante que, daqui a 2 ou 3 anos, o estado de conservação esteja idêntico ao de um carro zero — o seu {modelo} vai se destacar de todos os outros que estão para venda e aumentar o valor de revenda. 6x de R$ 777,00 ou 5% de desconto à vista.',
  },
  {
    prioridade: 6,
    setor: SETOR_NOVOS,
    banco: 'couro',
    servico: 'Combo Full de Proteção',
    argumento:
      'Combo Full para o seu {modelo}: Coating de Pintura + Coating de Couro nos bancos + Coating de Plásticos + Coating de Vidros. Com esse combo você garante que, daqui a 2 ou 3 anos, o estado de conservação esteja idêntico ao de um carro zero — o seu {modelo} vai se destacar de todos os outros que estão para venda e aumentar o valor de revenda. 6x de R$ 777,00 ou 5% de desconto à vista.',
  },
  {
    prioridade: 5,
    setor: SETOR_NOVOS,
    banco: null,
    servico: SERVICO_MARCADOR,
    argumento:
      'Agora é o momento ideal: o {modelo} 0km ainda não tem nenhuma imperfeição, e o coating congela esse estado de perfeição com brilho de showroom. {argumento_cor} 6x de R$ 198,00 (ou 6x de R$ 425,00 fechando junto com a proteção dos bancos), ou 5% de desconto à vista.',
  },
  {
    prioridade: 4,
    setor: SETOR_NOVOS,
    banco: 'tecido',
    servico: 'Impermeabilização de Tecidos',
    argumento:
      'Não podemos vacilar com os bancos em tecido: sabe aquele café ou água que pode cair sem querer? Com a proteção, o líquido não penetra — fica flutuando sobre a superfície e é só retirar com um papelzinho que o banco continua novo, sem manchas, sem marcas e sem odores. O ideal é realizar agora, antes de retirar o veículo da loja, pois ele ainda não tem nenhuma contaminação. 6x de R$ 93,00 ou 5% de desconto à vista.',
  },
  {
    prioridade: 4,
    setor: SETOR_NOVOS,
    banco: 'couro',
    servico: 'Coating de Couro',
    argumento:
      'Um carro com os bancos em couro é pura elegância, mas se não forem protegidos, o que parece um sonho se torna um pesadelo. O coating blinda o couro {cor_banco} contra manchas, água, abrasões, desgastes e o ressecamento causado pelos raios UV — se cair um café ou o suor do dia a dia encostar, não penetra na fibra. O ideal é realizar antes de retirar o veículo da loja, pois agora ele não tem nenhuma contaminação. 6x de R$ 160,00 ou 5% de desconto à vista.',
  },

  // NOVOS - RECÉM RETIRADO
  {
    prioridade: 5,
    setor: SETOR_RECEM,
    banco: null,
    servico: SERVICO_MARCADOR,
    argumento:
      'Momento de ouro: o verniz ainda está íntegro, então aplicamos o coating sem a necessidade de polimento corretivo pesado — serviço mais rápido e originalidade do verniz de fábrica preservada. {argumento_cor} 6x de R$ 198,00 ou 5% de desconto à vista.',
  },
  {
    prioridade: 4,
    setor: SETOR_RECEM,
    banco: 'couro',
    servico: 'Coating de Couro',
    argumento:
      'Com 60 dias de uso, o couro começa a absorver suor e a tinta das roupas (jeans), ficando brilhoso e gorduroso. O Coating impede a transferência de cor e mantém o toque aveludado original, evitando rachaduras precoces. 6x de R$ 160,00 ou 5% de desconto à vista.',
  },
  {
    prioridade: 4,
    setor: SETOR_RECEM,
    banco: 'tecido',
    servico: 'Impermeabilização de Tecidos',
    argumento:
      "Uma única mancha de líquido em um banco sem proteção pode se tornar permanente ou gerar mau cheiro. Com a impermeabilização, o líquido 'flutua' sobre o tecido — é só remover com um papel. Paz de espírito total no dia a dia. 6x de R$ 93,00 ou 5% de desconto à vista.",
  },

  // OFICINA
  {
    prioridade: 5,
    setor: SETOR_OFICINA,
    banco: null,
    servico: SERVICO_MARCADOR,
    argumento:
      'Restauração completa da pintura: descontaminação para remover as impurezas do verniz + polimento técnico para remover riscos e marcas superficiais + Coating para revestimento e proteção. {argumento_cor} Garantia e durabilidade de 1 ano. 6x de R$ 335,00 ou 5% de desconto à vista.',
  },
  {
    prioridade: 4,
    setor: SETOR_OFICINA,
    banco: 'couro',
    servico: 'Coating de Couro',
    argumento:
      'O brilho no banco não é limpeza: é excesso de oleosidade que resseca e racha o couro. Limpeza interna detalhada de todo o interior (bancos, teto, carpete, painel, volante, porta-malas) + Coating de Couro, igualando a cor original de fábrica. Garantia e durabilidade de 1 ano. 6x de R$ 160,00 ou 5% de desconto à vista.',
  },
  {
    prioridade: 3,
    setor: SETOR_OFICINA,
    banco: null,
    servico: 'Higienização Interna',
    argumento:
      "As manchas do estofamento não são só superficiais: removemos de dentro para fora com extratora e produtos específicos, limpeza manual de teto e colunas e eliminação de ácaros, fungos e bactérias. Documente o 'antes e depois' para o cliente ver a cor real do interior aparecendo. 6x de R$ 93,00 ou 5% de desconto à vista.",
  },

  // FUNILARIA
  {
    prioridade: 5,
    setor: SETOR_FUNILARIA,
    banco: null,
    servico: SERVICO_MARCADOR,
    argumento:
      "A peça reparada vem com brilho original de fábrica e o restante do carro não — o coating reveste a pintura nova e a antiga, igualando o brilho do carro todo ao de um carro novo, sem aquela diferença visual que 'denuncia' que o carro foi batido. {argumento_cor} Garantia de 3 anos (Q2) e 1 ano (CanCoat). 6x de R$ 198,00 ou 5% de desconto à vista.",
  },

  // SEMINOVOS
  {
    prioridade: 5,
    setor: SETOR_SEMINOVOS,
    banco: null,
    servico: SERVICO_MARCADOR,
    argumento:
      'Novo ciclo, nível máximo de excelência: o coating protege a pintura e o verniz e deixa o carro com a cara do novo dono, sem vestígios do anterior. {argumento_cor} Garantia de 3 anos (Q2) e 1 ano (CanCoat). 6x de R$ 198,00 (ou 6x de R$ 425,00 fechando junto com o Coating de Couro), ou 5% de desconto à vista.',
  },
  {
    prioridade: 4,
    setor: SETOR_SEMINOVOS,
    banco: 'couro',
    servico: 'Coating de Couro',
    argumento:
      "Higienização detalhada de todo o interior (teto, carpete, painel, volante, porta-malas) para remover qualquer vestígio do dono anterior — como uma camada de proteção 'hospitalar' no couro —, finalizada com o Coating de Couro. Garantia de 1 ano. 6x de R$ 160,00, ou 6x de R$ 425,00 junto com o Coating de Pintura.",
  },
];

// ---------------------------------------------------------------------------
// Contorno de objeções e dicas de ouro (seção 21 do manual)
// ---------------------------------------------------------------------------
type ObjecaoSeed = { tipo: 'objecao' | 'dica'; titulo: string; resposta: string };

const OBJECOES: ObjecaoSeed[] = [
  {
    tipo: 'objecao',
    titulo: '"O carro é novo, não precisa."',
    resposta:
      "O brilho de fábrica é lindo, mas ele é apenas estético, não tem proteção. É como um smartphone novo: ele vem brilhando, mas se cair no chão sem película, a tela quebra. O Coating é a 'película' da sua pintura — ele evita que uma simples sujeira de pássaro ou a poluição das ruas corroam o verniz original, que é muito fino e sensível. Por isso 98% dos nossos clientes não saem da loja sem essas proteções.",
  },
  {
    tipo: 'objecao',
    titulo: '"Eu não ligo muito para estética, para mim o carro é só para rodar."',
    resposta:
      'Eu compreendo, o senhor é prático. E é justamente por isso que esse serviço é para o senhor! Com a proteção cerâmica, o senhor vai lavar o carro na metade do tempo, ele vai ficar limpo por muito mais tempo — e o senhor não quer ter que gastar com repintura, certo? Além disso, na hora de trocar esse carro daqui a 2 ou 3 anos, o avaliador vai te pagar muito mais se a pintura e o interior estiverem novos. É um investimento que volta para o seu bolso na revenda. Por isso 98% dos nossos clientes não saem da loja sem essas proteções.',
  },
  {
    tipo: 'objecao',
    titulo: '"Já gastei muito na compra/documentação."',
    resposta:
      'Quando compramos um celular de última geração — que vale bem menos que o carro, que é o seu patrimônio — nós saímos da loja com a película e a capinha para minimizar o risco de estragar, certo? Da mesma forma precisamos fazer com o carro, ainda mais com o valor do seu investimento: a pintura e o couro/tecido são os primeiros aspectos observados na avaliação para troca ou revenda. Esses tratamentos são a única forma de congelar este estado de perfeição, sem que apareçam os primeiros riscos, marcas ou manchas permanentes. Por isso 98% dos nossos clientes não saem da loja sem essas proteções.',
  },
  {
    tipo: 'objecao',
    titulo: '"Não tenho esse dinheiro agora."',
    resposta:
      'Eu sei como é, os custos de retirada são altos. Mas pense o seguinte: o senhor acabou de fazer um grande investimento. Deixar de proteger esse valor por causa de uma parcela pode custar caro lá na frente — é muito mais barato proteger o verniz original e o estofamento agora do que ter que fazer uma repintura no futuro, ou ter uma mancha permanente e perder com a desvalorização. Consigo parcelar esse valor no cartão em até 6 vezes sem juros, ou com desconto à vista. Por isso 98% dos nossos clientes não saem da loja sem essas proteções.',
  },
  {
    tipo: 'objecao',
    titulo: '"No lava-jato ou no detalhamento de rua é mais barato."',
    resposta:
      'Eu entendo a comparação, mas há uma diferença grande: a nossa garantia é da própria concessionária {fabricante}. Se um serviço de rua danificar o seu verniz ou manchar o couro, você não tem a quem recorrer. Aqui usamos produtos homologados que não afetam a garantia de fábrica do seu carro. O senhor prefere economizar um pouco agora ou ter a segurança total da marca no seu veículo? Por isso 98% dos nossos clientes não saem da loja sem essas proteções.',
  },
  {
    tipo: 'dica',
    titulo: 'Entusiasmo na voz',
    resposta:
      "A compra de um carro zero é 90% emocional. Se você oferece o serviço com uma voz monótona ou técnica demais, você 'esfria' o momento do cliente. Quando você demonstra empolgação, o cliente sente que o serviço não é apenas uma manutenção, mas o toque final de luxo que o carro novo dele merece. Mesmo que ele não esteja te vendo, sorria enquanto fala — isso altera a ressonância das cordas vocais e deixa a voz mais acolhedora e positiva. O entusiasmo, quando equilibrado, soa como convicção.",
  },
  {
    tipo: 'dica',
    titulo: "Fale o nome do modelo, não 'seu carro'",
    resposta:
      "Falar o nome específico do modelo em vez de apenas 'seu carro' é personalização de alto impacto: (1) ativa o senso de propriedade e orgulho — quando você diz 'o seu {modelo}', você valida a escolha do cliente; (2) demonstra autoridade e atenção — ele não é apenas mais um número na sua planilha; (3) humaniza a relação — 'o carro' é um objeto frio, 'o {modelo}' tem identidade, e você entra no universo do cliente, tornando a conversa menos transacional e mais relacional.",
  },
  {
    tipo: 'dica',
    titulo: 'Velocidade da fala',
    resposta:
      'Não fale muito rápido para não parecer ansiosa em vender. Use pausas para que o cliente possa processar as informações.',
  },
  {
    tipo: 'dica',
    titulo: 'Mensagem padrão quando o cliente não atende (telefone)',
    resposta:
      "Envie apenas para levá-lo ao atendimento por ligação: 'Boa tarde {cliente}, meu nome é (seu nome), sou da {fabricante}. Tentei contato por ligação, mas não consegui retorno. Posso retornar em quanto tempo, ou prefere me retornar?'",
  },
];

// ---------------------------------------------------------------------------

export async function seedGuia(conn: Connection): Promise<void> {
  const [marcador] = await conn.query('SELECT id FROM servicos WHERE nome = ? LIMIT 1', [
    SERVICO_MARCADOR,
  ]);
  if ((marcador as unknown[]).length > 0) {
    console.log('• Conteúdo do Manual de Vendas já existe, seed ignorado.');
    return;
  }

  // Substitui o conteúdo antigo do MVP (era todo gerado por seed; o painel do
  // gestor — P3 — ainda não existe, então não há conteúdo editado a preservar).
  await conn.query('DELETE FROM regras');
  await conn.query('DELETE FROM roteiro_etapas');
  await conn.query('DELETE FROM servicos');
  await conn.query('DELETE FROM objecoes');
  console.log('• Conteúdo antigo do guia removido (substituído pelo Manual de Vendas).');

  // Cores: upsert por nome (mantém ids usados por regras antigas de cor).
  for (let i = 0; i < CORES.length; i++) {
    const [nome, hex, argumento] = CORES[i];
    await conn.query(
      `INSERT INTO cores (nome, hex, argumento, ordem)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE hex = VALUES(hex), argumento = VALUES(argumento), ordem = VALUES(ordem), ativo = 1`,
      [nome, hex, argumento, i],
    );
  }

  // Serviços.
  const servicoIds: Record<string, number> = {};
  for (let i = 0; i < SERVICOS.length; i++) {
    const [nome, selo, descricao] = SERVICOS[i];
    const [res] = await conn.query(
      'INSERT INTO servicos (nome, selo, descricao, ordem) VALUES (?, ?, ?, ?)',
      [nome, selo, descricao, i],
    );
    servicoIds[nome] = (res as { insertId: number }).insertId;
  }

  // Roteiro.
  await conn.query(
    'INSERT INTO roteiro_etapas (ordem, setor, canal, banco, titulo, instrucao, frase_template) VALUES ' +
      ETAPAS.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', '),
    ETAPAS.flatMap((e) => [e.ordem, e.setor, e.canal, e.banco, e.titulo, e.instrucao, e.frase]),
  );

  // Regras.
  await conn.query(
    'INSERT INTO regras (prioridade, setor, banco, servico_id, argumento_template) VALUES ' +
      REGRAS.map(() => '(?, ?, ?, ?, ?)').join(', '),
    REGRAS.flatMap((r) => [r.prioridade, r.setor, r.banco, servicoIds[r.servico], r.argumento]),
  );

  // Objeções e dicas.
  await conn.query(
    'INSERT INTO objecoes (tipo, ordem, titulo, resposta) VALUES ' +
      OBJECOES.map(() => '(?, ?, ?, ?)').join(', '),
    OBJECOES.flatMap((o, i) => [o.tipo, i, o.titulo, o.resposta]),
  );

  console.log(
    `✔ Manual de Vendas populado: ${SERVICOS.length} serviços, ${ETAPAS.length} etapas de roteiro, ${REGRAS.length} regras, ${OBJECOES.length} objeções/dicas, ${CORES.length} cores com argumento.`,
  );
}
