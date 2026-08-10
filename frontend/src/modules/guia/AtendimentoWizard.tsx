import { useEffect, useMemo, useRef, useState } from 'react';
import type { Usuario } from '../../types';
import { BrandLogo } from '../../components/BrandLogo';
import {
  CANAIS,
  CORES_COURO,
  SETORES,
  type Atendimento,
  type Banco,
  type Canal,
  type Cor,
  type Fabricante,
  type GuiaDados,
  type Modelo,
} from './guia.types';

interface Props {
  dados: GuiaDados;
  usuario: Usuario;
  atendimento: Atendimento;
  onChange: (a: Atendimento) => void;
  onGerar: () => void;
}

// Ponteiro preciso + hover = mouse/trackpad, ou seja, máquina com teclado
// físico. Serve para decidir o foco automático: no tablet/celular o teclado
// virtual subiria por cima do wizard. Avaliado uma vez no módulo — o tipo de
// dispositivo não muda durante o atendimento.
const temTecladoFisico =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// Consultado no momento do uso (não em nível de módulo): é uma preferência de
// acessibilidade que o usuário pode mudar durante a sessão.
function prefereMenosMovimento(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Formulário progressivo do atendimento: cada passo só aparece quando o
// anterior foi preenchido, guiando o consultor sem poluir a tela do tablet.
export function AtendimentoWizard({ dados, usuario, atendimento, onChange, onGerar }: Props) {
  const [filtroModelo, setFiltroModelo] = useState('');

  const temCliente = atendimento.cliente.trim().length > 0;
  // Concessionária (marca fixa) não escolhe fabricante — já vem selecionado.
  const escolheFabricante = dados.fabricantes.length > 1;
  const bancosCompletos =
    atendimento.banco !== null && (atendimento.banco !== 'couro' || atendimento.corBanco !== null);
  const completo = Boolean(
    temCliente &&
      atendimento.fabricante &&
      atendimento.modelo &&
      atendimento.cor &&
      bancosCompletos &&
      atendimento.setor &&
      atendimento.canal,
  );

  // Passos visíveis no momento (na ordem). Quando um novo passo é liberado,
  // a tela rola suavemente até ele.
  const passosVisiveis = useMemo(() => {
    const passos = ['cliente'];
    if (temCliente && escolheFabricante) passos.push('carro');
    if (temCliente && atendimento.fabricante) passos.push('modelo');
    if (atendimento.modelo) passos.push('cor');
    if (atendimento.cor) passos.push('bancos');
    if (atendimento.banco === 'couro') passos.push('corCouro');
    if (atendimento.cor && bancosCompletos) passos.push('setor');
    if (atendimento.setor) passos.push('canal');
    if (completo) passos.push('gerar');
    return passos;
  }, [temCliente, escolheFabricante, atendimento, bancosCompletos, completo]);

  const passosRef = useRef(new Map<string, HTMLElement>());
  const registrarPasso = (chave: string) => (el: HTMLElement | null) => {
    if (el) passosRef.current.set(chave, el);
    else passosRef.current.delete(chave);
  };
  const passosAnteriores = useRef<string[]>(passosVisiveis);
  useEffect(() => {
    const novo = passosVisiveis.filter((p) => !passosAnteriores.current.includes(p)).pop();
    passosAnteriores.current = passosVisiveis;
    if (novo) {
      // `scrollIntoView` em JS ignora o @media (prefers-reduced-motion) do CSS,
      // então a preferência é consultada aqui.
      passosRef.current.get(novo)?.scrollIntoView({
        behavior: prefereMenosMovimento() ? 'auto' : 'smooth',
        block: 'center',
      });
    }
  }, [passosVisiveis]);

  // Listas de modelos da FIPE podem ser grandes: filtro por texto.
  const modelosFiltrados = useMemo(() => {
    const lista = atendimento.fabricante?.modelos ?? [];
    const termo = filtroModelo.trim().toLowerCase();
    return termo ? lista.filter((m) => m.nome.toLowerCase().includes(termo)) : lista;
  }, [atendimento.fabricante, filtroModelo]);

  function escolherFabricante(f: Fabricante) {
    onChange({
      ...atendimento,
      fabricante: f,
      modelo: null,
      cor: null,
      banco: null,
      corBanco: null,
      setor: null,
      canal: null,
    });
    setFiltroModelo('');
  }
  function escolherModelo(m: Modelo) {
    onChange({
      ...atendimento,
      modelo: m,
      cor: null,
      banco: null,
      corBanco: null,
      setor: null,
      canal: null,
    });
  }
  function escolherCor(c: Cor) {
    onChange({ ...atendimento, cor: c, banco: null, corBanco: null, setor: null, canal: null });
  }
  function escolherBanco(b: Banco) {
    onChange({ ...atendimento, banco: b, corBanco: null, setor: null, canal: null });
  }

  let passo = 0;
  const numero = () => ++passo;

  return (
    <div className="wizard">
      {/* Identidade da concessionária no centro (admin vê o guarda-chuva PROCAR). */}
      <div className="wizard-marca">
        {usuario.marca ? (
          <>
            <BrandLogo marca={usuario.marca} size={72} />
            <h1 className="wizard-marca-nome">{usuario.nome}</h1>
          </>
        ) : (
          <h1 className="wizard-marca-nome">Novo atendimento</h1>
        )}
        <p className="wizard-marca-sub">Preencha os dados para gerar o guia de atendimento</p>
      </div>

      <section className="wizard-passo" ref={registrarPasso('cliente')}>
        <div className="guia-passo-cab">
          <span className="guia-passo-num">{numero()}</span> CLIENTE
        </div>
        <input
          className="wizard-cliente"
          placeholder="Nome do cliente..."
          value={atendimento.cliente}
          onChange={(e) => onChange({ ...atendimento, cliente: e.target.value })}
          // O rótulo visível é o cabeçalho "CLIENTE"; o placeholder some ao
          // digitar, então não serve como nome acessível.
          aria-label="Nome do cliente"
          // Nome de pessoa: teclado já em maiúscula inicial e sem corretor.
          autoCapitalize="words"
          spellCheck={false}
          // É o nome do CLIENTE, não do usuário logado — sugestão de preenchimento
          // do navegador aqui só atrapalharia.
          autoComplete="off"
          // Foco automático só onde há teclado físico. No tablet do balcão (uso
          // principal, §2 do CLAUDE.md) o autoFocus abre o teclado virtual em
          // cima do wizard, escondendo a marca e os próximos campos.
          autoFocus={temTecladoFisico}
        />
      </section>

      {temCliente && escolheFabricante && (
        <section className="wizard-passo" ref={registrarPasso('carro')}>
          <div className="guia-passo-cab">
            <span className="guia-passo-num">{numero()}</span> CARRO
          </div>
          <div className="guia-chips">
            {dados.fabricantes.map((f) => (
              <button
                key={f.id}
                className={`chip chip-marca ${atendimento.fabricante?.id === f.id ? 'chip-ativo' : ''}`}
                onClick={() => escolherFabricante(f)}
              >
                <BrandLogo marca={f.nome} size={26} />
                <span>{f.nome}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {temCliente && atendimento.fabricante && (
        <section className="wizard-passo" ref={registrarPasso('modelo')}>
          <div className="guia-passo-cab">
            <span className="guia-passo-num">{numero()}</span> MODELO
          </div>
          <input
            className="guia-busca-modelo"
            placeholder="Buscar modelo..."
            value={filtroModelo}
            onChange={(e) => setFiltroModelo(e.target.value)}
          />
          <div className="guia-chips guia-chips-scroll">
            {modelosFiltrados.length === 0 ? (
              <span className="guia-hint">Nenhum modelo encontrado.</span>
            ) : (
              modelosFiltrados.map((m) => (
                <button
                  key={m.id}
                  className={`chip ${atendimento.modelo?.id === m.id ? 'chip-ativo' : ''}`}
                  onClick={() => escolherModelo(m)}
                >
                  <span>{m.nome}</span>
                  {m.categoria && <small>{m.categoria}</small>}
                </button>
              ))
            )}
          </div>
        </section>
      )}

      {atendimento.modelo && (
        <section className="wizard-passo" ref={registrarPasso('cor')}>
          <div className="guia-passo-cab">
            <span className="guia-passo-num">{numero()}</span> COR
          </div>
          <div className="guia-cores">
            {dados.cores.map((c) => (
              <button
                key={c.id}
                className={`cor ${atendimento.cor?.id === c.id ? 'cor-ativa' : ''}`}
                onClick={() => escolherCor(c)}
                title={c.nome}
              >
                <span className="cor-bola" style={{ background: c.hex }} />
                <span className="cor-nome">{c.nome}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {atendimento.cor && (
        <section className="wizard-passo" ref={registrarPasso('bancos')}>
          <div className="guia-passo-cab">
            <span className="guia-passo-num">{numero()}</span> BANCOS
          </div>
          <div className="guia-chips">
            {(['tecido', 'couro'] as Banco[]).map((b) => (
              <button
                key={b}
                className={`chip ${atendimento.banco === b ? 'chip-ativo' : ''}`}
                onClick={() => escolherBanco(b)}
              >
                {b === 'tecido' ? 'Tecido' : 'Couro'}
              </button>
            ))}
          </div>
        </section>
      )}

      {atendimento.banco === 'couro' && (
        <section className="wizard-passo" ref={registrarPasso('corCouro')}>
          <div className="guia-passo-cab">
            <span className="guia-passo-num">{numero()}</span> COR DO COURO
          </div>
          <div className="guia-cores">
            {CORES_COURO.map((c) => (
              <button
                key={c.nome}
                className={`cor ${atendimento.corBanco === c.nome ? 'cor-ativa' : ''}`}
                onClick={() => onChange({ ...atendimento, corBanco: c.nome, setor: null, canal: null })}
                title={c.nome}
              >
                <span className="cor-bola" style={{ background: c.hex }} />
                <span className="cor-nome">{c.nome}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {atendimento.cor && bancosCompletos && (
        <section className="wizard-passo" ref={registrarPasso('setor')}>
          <div className="guia-passo-cab">
            <span className="guia-passo-num">{numero()}</span> SETOR
          </div>
          <select
            className="wizard-select"
            value={atendimento.setor ?? ''}
            onChange={(e) => onChange({ ...atendimento, setor: e.target.value || null, canal: null })}
          >
            <option value="">Selecione o setor...</option>
            {SETORES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </section>
      )}

      {atendimento.setor && (
        <section className="wizard-passo" ref={registrarPasso('canal')}>
          <div className="guia-passo-cab">
            <span className="guia-passo-num">{numero()}</span> CANAL
          </div>
          <div className="guia-chips">
            {CANAIS.map((c) => (
              <button
                key={c.valor}
                className={`chip ${atendimento.canal === c.valor ? 'chip-ativo' : ''}`}
                onClick={() => onChange({ ...atendimento, canal: c.valor as Canal })}
              >
                {c.rotulo}
              </button>
            ))}
          </div>
        </section>
      )}

      {completo && (
        <div className="wizard-acao" ref={registrarPasso('gerar')}>
          <button className="btn btn-primario btn-bloco btn-gerar" onClick={onGerar}>
            Gerar manual de vendas digital →
          </button>
        </div>
      )}
    </div>
  );
}
