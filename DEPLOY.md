# DEPLOY.md — Implantação e Manutenção do PROCAR

**Versão 2.0** · VPS Hostinger · Ubuntu 24.04 LTS · Node.js + TypeScript + MySQL

> **O que mudou da v1 para a v2:** esta versão incorpora as correções de uma auditoria completa (`AUDITORIA-DEPLOY.md`) que encontrou 30 problemas — 8 deles bloqueantes num ambiente limpo. Cada correção está marcada no texto com o código da auditoria, assim: **`[A-03]`**.
>
> **Para quem é este documento:** para você daqui a seis meses, para um colega que nunca configurou um servidor, ou para quem assumir o sistema depois. Não pressupõe conhecimento prévio de Linux.
>
> **Promessa desta versão:** seguindo na ordem, do começo ao fim, numa VPS recém-criada, **não deve ser necessária nenhuma correção manual**. Todo comando foi validado quanto a ordem, dependências e comportamento em ambiente limpo.

---

## Como usar este guia

| Parte | Seções | Quando ler |
|---|---|---|
| **Preparação** | 0 a 2 | Antes de tocar no servidor. A Seção 0 evita a maioria dos problemas. |
| **A — Implantação** | 3 a 16 | Uma vez só, na ordem, do começo ao fim. |
| **B — Operação** | 17 a 18 | Toda vez que atualizar o sistema. |
| **C — Manutenção** | 19 a 23 | Todo mês, para sempre. É o que faz o sistema durar. |

**Convenções:**

- Blocos escuros são **comandos** — copie, cole no terminal, `Enter`.
- `MAIÚSCULAS_ASSIM` = valor que **você** precisa trocar.
- **`[24.04]`** = específico do Ubuntu 24.04; tutoriais de 22.04 erram aqui.
- **`[PROCAR]`** = decisão tomada por causa de uma característica deste projeto (ver `CLAUDE.md`).
- **`[A-nn]`** = correção vinda da auditoria.
- **✅ Deve aparecer:** o que você vê quando dá certo.
- ⚠️ **PORTÃO** = ponto de verificação obrigatório. **Não avance sem o resultado esperado.**

---

## Glossário

| Termo | Em português claro |
|---|---|
| **VPS** | Computador que fica ligado 24h num data center e que você controla pela internet. |
| **SSH** | O jeito de entrar no servidor e digitar comandos a partir do seu computador. |
| **root** | O usuário "dono de tudo". Pode destruir o sistema por engano — por isso não usamos no dia a dia. |
| **sudo** | Prefixo que dá poder de root para **um comando só**. |
| **Nginx** | Atende quem acessa o site: entrega as telas e repassa as chamadas de dados ao Node. |
| **Node / backend / API** | O programa que consulta o banco e responde as perguntas do sistema. |
| **PM2** | O "vigia" do backend: mantém ligado, religa se cair, religa depois de um reboot. |
| **MySQL** | O banco de dados: usuários, serviços, roteiro, regras, veículos. |
| **Certbot** | Emite de graça o certificado que faz aparecer o cadeado (HTTPS). |
| **UFW** | O "porteiro": decide quais portas ficam abertas para a internet. |
| **Fail2Ban** | Bloqueia automaticamente quem tenta invadir. |
| **Deploy** | Publicar uma versão nova do sistema. |
| **Rollback** | Voltar para a versão anterior quando o deploy dá problema. |
| **Build / compilar** | Traduzir o código-fonte (TypeScript) para o que roda de fato (JavaScript). |
| **Cron** | O "despertador" do Linux: roda comandos em horários programados. |
| **devDependencies** | Bibliotecas usadas só para desenvolver e compilar (ex.: o compilador TypeScript). Não são necessárias para o sistema rodar. |

---

# PREPARAÇÃO

## 0. Pré-requisitos — verifique ANTES de criar a VPS

⚠️ **PORTÃO 0.** Cinco verificações no seu **computador local**, dentro da pasta do projeto. Elas levam dois minutos e evitam quatro dos oito problemas bloqueantes que a auditoria encontrou.

### 0.1. `[A-08]` O `package-lock.json` está versionado?

O guia usa `npm ci`, que **exige** esse arquivo. Sem ele, a instalação falha logo no primeiro deploy.

```bash
git ls-files backend/package-lcock.json frontend/package-lock.json
```
✅ **Deve aparecer:** os dois caminhos listados.

❌ **Se não aparecer nada:** os lockfiles não estão no repositório. Corrija **antes de continuar**:
```bash
cd backend && npm install && cd ../frontend && npm install && cd ..
# confira se o .gitignore não está bloqueando:
grep -n "package-lock" .gitignore
git add backend/package-lock.json frontend/package-lock.json
git commit -m "chore: versiona os lockfiles para deploy reproduzível"
git push
```
> **Por que isso importa:** o lockfile registra a versão exata de cada biblioteca (e das bibliotecas delas). É o que garante que o servidor instale **exatamente** o que você testou. Sem ele, o deploy de hoje e o de amanhã podem produzir sistemas diferentes a partir do mesmo código.

### 0.2. `[A-30]` Os arquivos `.env` estão fora do Git?

```bash
git ls-files | grep -E "(^|/)\.env$"
```
✅ **Deve aparecer:** nada.

❌ **Se aparecer algum `.env`:** ele está versionado. Além do risco óbvio de vazamento de senha, isso **quebra o deploy**: o clone traria esse arquivo e ele competiria com o link para o `.env` de produção. Remova do controle de versão:
```bash
git rm --cached backend/.env frontend/.env
echo ".env" >> .gitignore
git commit -m "chore: remove .env do versionamento"
git push
```
E **troque todas as senhas que já estiveram nesse arquivo** — elas devem ser consideradas comprometidas.

### 0.3. `[A-11]` Como o `db:setup` é executado?

```bash
cd backend && npm run
```
Isso lista os scripts disponíveis e o comando real de cada um. Procure a linha do `db:setup`:

| Se o comando for… | Significa | Impacto no deploy |
|---|---|---|
| `tsx src/database/setup.ts` ou `ts-node ...` | Roda o TypeScript direto, usando uma ferramenta de desenvolvimento | O `db:setup` **precisa** rodar antes da poda das devDependencies (já é a ordem deste guia) |
| `node dist/database/setup.js` | Roda o código já compilado | Funciona em qualquer ordem depois do build |

Nos dois casos a ordem do guia funciona. Anote qual é o seu caso — isso aparece de novo na Seção 12.

### 0.4. `[A-26]` Existe uma rota de saúde (`/api/health`)?

```bash
grep -rn "health" backend/src/routes/ backend/src/server.ts 2>/dev/null
```

Se **não existir**, adicione — são cinco linhas e é o que permite o rollback automático e o monitoramento externo. No `src/server.ts` (ou num arquivo de rotas), **antes** de qualquer middleware de autenticação:

```typescript
// Rota de saúde: responde sem exigir login, para o deploy e o monitoramento
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});
```

> **Versão mais completa (opcional, recomendada):** verificar também o banco, para distinguir "o Node está de pé" de "o sistema está realmente funcional":
> ```typescript
> app.get('/api/health', async (_req, res) => {
>   try {
>     await pool.query('SELECT 1');
>     res.status(200).json({ status: 'ok', db: 'ok', uptime: process.uptime() });
>   } catch {
>     res.status(503).json({ status: 'degraded', db: 'erro' });
>   }
> });
> ```

### 0.5. `[A-10]` `[PROCAR]` O Express confia no proxy?

Esta é a verificação mais importante desta seção, e a que tem consequência mais grave se for esquecida.

```bash
grep -rn "trust proxy" backend/src/
```

Se **não retornar nada**, adicione no `src/server.ts`, logo depois de criar o `app`:
```typescript
const app = express();

// [PROCAR] Atrás do Nginx, TODAS as conexões chegam de 127.0.0.1.
// Sem esta linha, o Express ignora o cabeçalho X-Forwarded-For e o limite
// de requisições por IP passa a contar todo mundo como o mesmo cliente:
// 5 tentativas erradas de qualquer pessoa bloqueariam TODOS os consultores.
// O valor 1 = "confie em exatamente um proxy à minha frente" (o nosso Nginx).
// Nunca use `true` aqui: isso confiaria em cabeçalhos forjados pelo cliente.
app.set('trust proxy', 1);
```

⚠️ **Sem isso, o sistema entra no ar com o controle de tentativas de login inoperante** — e o sintoma (todo mundo bloqueado de uma vez) é confundido com bug de autenticação.

### 0.6. Versão do Node usada no projeto

```bash
cat .nvmrc 2>/dev/null; grep -A3 '"engines"' backend/package.json
```
Anote o resultado — usaremos na Seção 5.

### 0.7. O que ter em mãos

- Conta na Hostinger com plano **VPS** (≥ 2 GB de RAM).
- **Domínio** registrado.
- Repositório no **GitHub** (privado, de preferência) com acesso de administrador — você vai cadastrar uma chave de deploy nele.
- Um computador com SSH (Windows 10/11, macOS e Linux já vêm com um).
- Se você já tem os dados FIPE num banco local, um dump deles (Seção 12.5).

---

## 1. Como o PROCAR fica montado no servidor

```
                    Internet (o consultor, no tablet da loja)
                                   │
                                   ▼  HTTPS (porta 443)
                        ┌──────────────────────┐
                        │        NGINX         │  ← o recepcionista
                        │  atende todo mundo   │
                        └───────┬──────────────┘
              telas do sistema  │  chamadas de dados (/api)
                     ▼          ▼
        arquivos prontos    ┌──────────────┐        ┌──────────┐
        (HTML/CSS/JS)       │  NODE (PM2)  │◄──────►│  MYSQL   │
        current/frontend/   │  porta 3333  │        │ (local)  │
              dist          └──────────────┘        └──────────┘
                              o cérebro              a memória
                    VPS Hostinger · Ubuntu 24.04 LTS
```

**Por que tudo no mesmo servidor e no mesmo domínio?** O PROCAR foi projetado para ser leve (`CLAUDE.md` §2). Com o site e a API no mesmo endereço, o navegador não precisa fazer verificações extras antes de cada requisição (menos tráfego — importante, porque a internet nas lojas é ruim), e o cookie de login (`SameSite=Strict`) funciona da forma mais simples possível.

**`[PROCAR]` A regra que atravessa o guia inteiro: o backend roda como UMA instância só.** Nunca use o modo cluster do PM2. Motivo: o controle de tentativas de login, o limite de requisições e o trabalho de limpeza dos registros antigos (retenção de 60 dias dos `atendimentos`) vivem **na memória do processo**. Com duas instâncias, cada uma teria a própria contagem — os limites deixariam de proteger — e a limpeza rodaria em duplicidade.

---

## 2. Criando a VPS na Hostinger

1. Contrate um plano **VPS** com **2 GB de RAM ou mais**. O sistema em funcionamento é leve, mas compilar consome memória por alguns minutos a cada atualização.
2. No hPanel: **VPS → seu servidor**. No assistente:
   - **Data center:** o mais próximo das lojas (São Paulo, se disponível).
   - **Sistema operacional:** **`Ubuntu 24.04 LTS`**, sem painel de controle embutido (cPanel, Plesk e afins consomem memória à toa e atrapalham a configuração manual).
     > "LTS" = suporte de segurança até **abril de 2029**. Versões não-LTS param em nove meses.
   - **Acesso:** se aparecer **"Adicionar chave SSH"**, use (veja o quadro). Se só houver senha, defina uma forte — ela será desativada na Seção 4, **depois** da verificação obrigatória do PORTÃO 3.
3. **Anote o endereço IPv4** que aparece no painel (ex.: `123.45.67.89`).

> ### Criando sua chave SSH (faça agora, no seu computador)
> Uma senha pode ser adivinhada por tentativa e erro; uma chave, não.
> ```bash
> ssh-keygen -t ed25519 -C "procar-vps"
> ```
> Aperte `Enter` nas perguntas. Isso cria dois arquivos:
> - `~/.ssh/id_ed25519` → **privada**. Nunca compartilhe, nunca copie para servidor nenhum.
> - `~/.ssh/id_ed25519.pub` → **pública**. É esta que você cadastra na Hostinger.
>
> Para ver e copiar a pública:
> ```bash
> # Windows (PowerShell)
> type $env:USERPROFILE\.ssh\id_ed25519.pub
> # macOS / Linux
> cat ~/.ssh/id_ed25519.pub
> ```
> Cole no assistente da Hostinger, ou depois em **VPS → SSH Keys**.

---

# PARTE A — IMPLANTAÇÃO

## 3. Preparando o servidor

### 3.1. Primeiro acesso

**Pelo navegador:** hPanel → VPS → **"Terminal do navegador"**. Funciona sem instalar nada e **é o seu plano B se algo der errado com o SSH** — vale saber onde fica.

**Pelo seu computador (use este no dia a dia):**
```bash
ssh root@SEU_IP_AQUI
```
Na primeira vez ele mostra um código longo e pergunta se você confia. Digite `yes`.

✅ **Deve aparecer:** um prompt terminando em `#`:
```
root@srv123456:~#
```

### 3.2. `[24.04]` `[A-15]` Evitar a tela azul que trava as atualizações

O Ubuntu 24.04 traz o `needrestart`, que interrompe toda atualização com uma tela perguntando quais serviços reiniciar. Isso confunde quem segue um passo a passo e **trava scripts automáticos**.

A v1 do guia usava um `sed` no arquivo original — frágil, porque depende do texto exato da linha. A forma correta é um arquivo próprio, que sobrepõe a configuração sem editar nada do sistema:

```bash
mkdir -p /etc/needrestart/conf.d
echo "\$nrconf{restart} = 'a';" > /etc/needrestart/conf.d/99-procar.conf
```
**O que faz:** troca "perguntar" por "reiniciar automaticamente o que for necessário". Seguro — reiniciar um serviço logo após atualizá-lo é justamente o correto. E é idempotente: rodar duas vezes não causa problema.

### 3.3. `[A-16]` Atualizar o sistema (e o erro de "lock" que assusta)

⚠️ Numa VPS recém-criada, o Ubuntu costuma estar aplicando atualizações automáticas em segundo plano. Se você rodar `apt` nesse momento, aparece:
```
Could not get lock /var/lib/dpkg/lock-frontend - open (11: Resource temporarily unavailable)
```
**Isso não é erro, é fila.** Espere a vez com o comando abaixo, que devolve o controle assim que liberar:

```bash
while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do
  echo "Aguardando o sistema terminar as atualizações automáticas..."; sleep 5
done; echo "Livre."
```

Agora sim:
```bash
apt update && apt upgrade -y && apt autoremove -y
```
| Comando | O que faz |
|---|---|
| `apt update` | Baixa a lista do que existe disponível. Não instala nada. |
| `apt upgrade -y` | Instala as versões novas do que já está no servidor, incluindo correções de segurança. |
| `apt autoremove -y` | Remove restos de pacotes que ninguém usa mais. |

```bash
reboot
```
Sua conexão cai — é esperado. Espere ~1 minuto e entre de novo.

### 3.4. Nome do servidor (hostname)

```bash
hostnamectl set-hostname procar-vps
grep -q "127.0.1.1" /etc/hosts || echo "127.0.1.1   procar-vps" >> /etc/hosts
```
A segunda linha só adiciona a entrada se ela ainda não existir — pode rodar sem medo de duplicar.

### 3.5. Fuso horário

```bash
timedatectl set-timezone America/Sao_Paulo
timedatectl
```
✅ **Deve aparecer:** `Time zone: America/Sao_Paulo (-03, -0300)` e `System clock synchronized: yes`.

**`[PROCAR]` Por que importa aqui:** o monitoramento do gestor (`/gestor/uso`) mostra "último login", "online há X minutos" e gráficos por dia, tudo calculado **no servidor**. Com o fuso errado, os números aparecem deslocados em 3 horas e o gestor tira conclusões erradas sobre o uso nas lojas. Os horários dos backups (Seção 18) também seguem esse relógio.

### 3.6. `[A-17]` Memória de reserva (swap), de forma idempotente

**O que é:** quando a RAM acaba, o Linux usa um pedaço do disco como memória de emergência. Não acelera nada — evita que um pico momentâneo mate um processo. No nosso caso, o pico é o `npm run build` de cada atualização.

Alguns templates da Hostinger já vêm com swap. O bloco abaixo verifica antes de criar, e pode ser executado várias vezes sem duplicar nada:

```bash
if swapon --show | grep -q .; then
  echo "Swap já existe:"; swapon --show
else
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap de 2 GB criado."
fi

grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
sysctl -p >/dev/null

free -h
```
✅ **Deve aparecer:** uma linha `Swap:` com pelo menos `2,0Gi`.

O `vm.swappiness=10` diz ao Linux: "use o swap só quando realmente precisar".

### 3.7. `[A-05]` Criar o usuário do dia a dia — e garantir que ele tem chave

Usar `root` para tudo é como andar com uma motosserra ligada dentro de casa.

```bash
adduser procar
```
Defina uma senha (**anote** — é a que você digita quando usar `sudo`) e aperte `Enter` nos campos opcionais.

```bash
usermod -aG sudo procar
```

Agora a cópia da chave SSH:
```bash
rsync --archive --chown=procar:procar ~/.ssh /home/procar 2>/dev/null || true
```

⚠️ **PORTÃO 3 — este é o ponto mais perigoso do guia inteiro.**

O comando acima só funciona se o `root` tiver entrado **por chave**. Se você entrou por senha, ele não copia nada — e a Seção 4 vai desativar a senha, **trancando você para fora do servidor**. Verifique **agora**:

```bash
if sudo test -s /home/procar/.ssh/authorized_keys; then
  echo "✅ OK — o usuário procar tem chave. Pode seguir."
  sudo wc -l < /home/procar/.ssh/authorized_keys | xargs echo "   chaves cadastradas:"
else
  echo "❌ PARE. O usuário procar NÃO tem chave cadastrada."
  echo "   NÃO avance para a Seção 4 antes de resolver (veja abaixo)."
fi
```

❌ **Se aparecer "PARE", resolva por um dos dois caminhos:**

**Caminho A — do seu computador (mais fácil):**
```bash
# No SEU computador, não no servidor:
ssh-copy-id procar@SEU_IP_AQUI
```
Ele pede a senha do usuário `procar` uma última vez e instala sua chave pública.

**Caminho B — colando à mão no servidor:**
```bash
sudo mkdir -p /home/procar/.ssh
sudo nano /home/procar/.ssh/authorized_keys
# Cole aqui o conteúdo do seu id_ed25519.pub (uma linha só, começando com ssh-ed25519)

sudo chown -R procar:procar /home/procar/.ssh
sudo chmod 700 /home/procar/.ssh
sudo chmod 600 /home/procar/.ssh/authorized_keys
```
As permissões não são detalhe: o SSH **recusa** usar um `authorized_keys` acessível a outros usuários, e a mensagem de erro não deixa isso claro.

**Teste final, numa janela NOVA** (mantenha a atual aberta):
```bash
ssh procar@SEU_IP_AQUI
```
✅ **Deve aparecer:** um prompt terminando em `$`, sem pedir senha:
```
procar@procar-vps:~$
```

**Só avance quando isso funcionar.** Daqui em diante, use sempre este usuário e escreva `sudo` na frente dos comandos administrativos.

> **Regra de ouro:** ao mexer em acesso (SSH, firewall, usuários), sempre mantenha a sessão atual aberta e teste numa janela nova.

---

## 4. Segurança de acesso (SSH e firewall)

> **`[A-03]` `[A-04]` Nota sobre a ordem:** na v1 desta seção vinham comandos que dependiam de pacotes ainda não instalados (o perfil `Nginx Full` do UFW e as jails de Nginx do Fail2Ban), e ambos falhavam numa VPS limpa. Na v2, esta seção usa **apenas** o que já existe no sistema; o Fail2Ban foi movido para a Seção 6 e as jails do Nginx para a Seção 13.

### 4.1. `[24.04]` Endurecer o SSH

⚠️ **Confirme que o PORTÃO 3 passou** (você entra como `procar` sem digitar senha). Se não, volte.

No Ubuntu 24.04 existe uma pasta própria para suas customizações: colocar as regras lá evita que elas se percam quando o sistema atualizar o arquivo original.

```bash
sudo nano /etc/ssh/sshd_config.d/99-procar-hardening.conf
```
```
# Ninguém entra diretamente como root — use "procar" + sudo
PermitRootLogin no

# Só chave SSH; senha deixa de ser aceita
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes

# No máximo 3 tentativas por conexão
MaxAuthTries 3

# Recursos que não usamos
X11Forwarding no
AllowAgentForwarding no
```

Valide a sintaxe **antes** de aplicar:
```bash
sudo sshd -t
```
✅ **Deve aparecer:** nada. Silêncio = arquivo correto. Se aparecer mensagem de erro, ela indica a linha — corrija antes de continuar.

```bash
sudo systemctl restart ssh
```
> **`[24.04]`** No Ubuntu 24.04 o SSH é iniciado por *socket activation*: um processo novo é criado a cada conexão, já lendo a configuração atual. Na prática, as novas conexões respeitam o arquivo mesmo sem reiniciar nada. Se o comando acima reclamar, use `sudo systemctl restart ssh.socket`.

**Teste numa janela nova antes de fechar a atual.**

> **Trocar a porta do SSH (opcional):** `[24.04]` a linha `Port 2222` no arquivo de configuração **é ignorada** — quem decide é o socket. Reduz ruído de robôs, mas não é essencial:
> ```bash
> sudo systemctl edit ssh.socket
> ```
> Adicione entre os comentários:
> ```
> [Socket]
> ListenStream=
> ListenStream=2222
> ```
> ```bash
> sudo systemctl daemon-reload && sudo systemctl restart ssh.socket
> sudo ufw allow 2222/tcp
> ```
> Libere a 2222 também no firewall do hPanel e conecte com `ssh -p 2222 procar@IP`.

### 4.2. `[A-03]` Firewall — duas camadas

**Camada 1 — no hPanel** (barra o tráfego antes de chegar no servidor): **VPS → Firewall**. Libere apenas **22**, **80** e **443**, e aplique o conjunto à VPS.

**Camada 2 — no próprio Ubuntu.** Use **números de porta**, não nomes de perfil: o perfil `Nginx Full` só existe depois que o Nginx é instalado, e usá-lo aqui deixaria o firewall ativo **sem as portas do site liberadas** — com o site fora do ar e o diagnóstico apontando para o lugar errado.

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```
Ele avisa que pode interromper conexões SSH — como a porta 22 já foi liberada na linha anterior, responda `y`.

```bash
sudo ufw status verbose
```
✅ **Deve aparecer:** `Status: active` e as três portas.

**Por que 3333 (backend) e 3306 (MySQL) não aparecem:** porque **não devem** ser acessíveis pela internet. Eles conversam entre si dentro da própria máquina. Essa é uma das medidas de segurança mais importantes do guia.

---

## 5. Instalando os programas

### 5.1. Ferramentas de base

```bash
sudo apt install -y build-essential git curl unzip htop ncdu rsync jq ca-certificates gnupg
```
| Pacote | Para quê |
|---|---|
| `build-essential` | Compiladores — algumas bibliotecas do Node precisam compilar código na instalação. |
| `git` | Baixa o código do GitHub. |
| `curl` | Requisições pela linha de comando (usado nos testes de saúde). |
| `htop` | Mostra visualmente o que consome CPU e memória. |
| `ncdu` | Mostra o que ocupa disco, pasta por pasta. |
| `rsync` | Copia arquivos com eficiência (backups). |
| `jq` | **`[A-27]`** Lê dados em JSON de forma confiável — usado pelo painel de saúde. |
| `ca-certificates`, `gnupg` | Exigidos pelo repositório do Node.js. |

### 5.2. Node.js

**Atenção à versão.** O `CLAUDE.md` registra que o PROCAR foi desenvolvido com **Node.js 20** — mas o Node 20 chegou ao fim de vida em **abril de 2026** e não recebe mais correção de segurança nenhuma. Não é aceitável em produção.

<cite index="6-1">Hoje as linhas com suporte são o Node.js 24 (Active LTS) e o Node.js 22 (Maintenance LTS)</cite>; <cite index="2-1">o 24 vai até 30 de abril de 2028 e o 22 encerra em 30 de abril de 2027</cite>.

**Recomendação: Node.js 22 LTS**, pelo raciocínio abaixo:
- O código foi escrito e testado no 20. O salto para o 22 é pequeno e quase sempre indolor; para o 24 é maior e tem chance real de exigir ajuste em alguma dependência.
- O 22 tem segurança garantida até abril de 2027 — folga confortável para validar o 24 com calma.
- **Registre a migração para o Node 24 no plano anual (Seção 21).**

Se você **tiver como testar o sistema completo antes de publicar** (typecheck, build, login, geração de guia), vá direto para o **24** e evite fazer a migração duas vezes. Se for publicar sem essa validação, fique no 22.

Se o PORTÃO 0.6 mostrou um `.nvmrc` ou `engines` no projeto, essa versão manda.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v
```
✅ **Deve aparecer:** `v22.x.x` e `10.x.x` (ou superior).

`[A-01]` Confirme que o npm não está configurado para pular dependências de desenvolvimento:
```bash
npm config get omit
```
✅ **Deve aparecer:** vazio ou `[]`. Se aparecer `dev`, o build vai falhar mais adiante — corrija com `npm config delete omit`.

### 5.3. MySQL, Nginx, PM2, Certbot e Fail2Ban

```bash
sudo apt install -y mysql-server nginx certbot python3-certbot-nginx fail2ban
sudo npm install -g pm2
```

```bash
systemctl is-active mysql nginx
```
✅ **Deve aparecer:** `active` duas vezes.

> **npm ou pnpm?** O projeto usa scripts `npm run`. Mantenha **npm** no servidor — assim o comando que roda em produção é exatamente o que você testa. Trocar a ferramenta só no servidor cria uma diferença sutil entre ambientes, que é justamente o tipo de coisa que gera bug difícil de achar.

---

## 6. `[A-04]` Proteção contra invasão (Fail2Ban) e atualizações automáticas

Agora que o Nginx existe, o Fail2Ban pode ser configurado sem erro. Ainda assim, começamos **apenas com a jail do SSH** — as jails do Nginx entram na Seção 13, quando os arquivos de log dele já tiverem sido criados.

### 6.1. Fail2Ban

```bash
sudo nano /etc/fail2ban/jail.local
```
```ini
[DEFAULT]
# Quem errar 5 vezes em 10 minutos fica banido por 1 hora
bantime  = 1h
findtime = 10m
maxretry = 5

# Reincidentes ficam banidos progressivamente mais tempo
bantime.increment = true
bantime.maxtime   = 1w

# Nunca bane a si mesmo
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
# [24.04] OBRIGATÓRIO: o Ubuntu 24.04 não instala mais o rsyslog, então o
# /var/log/auth.log pode não existir e os registros de login vivem só no
# journal do systemd. Sem esta linha, a jail sobe "com sucesso" e não
# protege nada. Ela fica AQUI, e não em [DEFAULT], porque as jails do
# Nginx (Seção 13) leem arquivos de log e precisam do backend padrão.
backend = systemd
```

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status
```
✅ **Deve aparecer:** `Jail list: sshd`

```bash
sudo fail2ban-client status sshd
```
✅ **Deve aparecer:** um bloco com `Currently failed`, `Total failed`, `Currently banned`. Se der erro dizendo que não encontrou log, revise o `backend = systemd`.

> Em poucos dias o "Total banned" começa a subir. É **normal** — a internet inteira é varrida por robôs procurando servidores mal configurados. O ponto é que agora eles são bloqueados sozinhos.

### 6.2. Atualizações de segurança automáticas

```bash
sudo apt install -y unattended-upgrades
systemctl is-active unattended-upgrades
```
✅ **Deve aparecer:** `active` (ou `activating`/`inactive` com `is-enabled` = `enabled`; confirme com `systemctl is-enabled unattended-upgrades`).

Se não estiver ativo:
```bash
sudo dpkg-reconfigure --priority=low unattended-upgrades   # responda "Yes"
```

**O que ele faz:** aplica sozinho apenas as **correções de segurança** do Ubuntu. Não instala versões novas de programas nem troca o Ubuntu de versão. **Não reinicia o servidor** — reiniciar fica com você, na manutenção mensal (Seção 20).
---

## 7. Banco de dados MySQL

### 7.1. Proteção inicial

```bash
sudo mysql_secure_installation
```
| Pergunta (resumida) | Resposta | Por quê |
|---|---|---|
| Validar força de senha? | `n` | O validador às vezes rejeita senhas boas por regras rígidas. Você vai usar senhas fortes de qualquer forma. |
| Definir senha do root? | `y` + senha forte | **Anote.** É diferente da senha do usuário do Linux. |
| Remover usuários anônimos? | `y` | Contas sem senha não têm razão de existir. |
| Desabilitar login remoto do root? | `y` | O root do banco só deve ser usado de dentro do servidor. |
| Remover banco de testes? | `y` | Banco de exemplo, acessível a qualquer um. |
| Recarregar privilégios? | `y` | Aplica agora. |

### 7.2. `[A-12]` Entrando no MySQL (e por que `-u root -p` pode falhar)

No Ubuntu, o `root@localhost` do MySQL usa por padrão o plugin `auth_socket`: **ele não tem senha** — a autenticação é feita pelo usuário do sistema operacional. Dependendo de como o `mysql_secure_installation` se comportou, `sudo mysql -u root -p` pode retornar `Access denied` mesmo com a senha que você acabou de definir.

Descubra o que está valendo no seu servidor:
```bash
sudo mysql -e "SELECT user, host, plugin FROM mysql.user WHERE user='root';"
```
| Se o `plugin` for… | Como entrar |
|---|---|
| `auth_socket` | `sudo mysql` (sem `-u` e sem `-p`) |
| `caching_sha2_password` ou `mysql_native_password` | `sudo mysql -u root -p` |

**O comando `sudo mysql` funciona nos dois casos** — é o que este guia usa daqui em diante.

### 7.3. Criar o usuário e o banco do PROCAR

**Nunca use o root do MySQL na aplicação.** Se o sistema for comprometido, o invasor teria acesso a tudo.

```bash
sudo mysql
```
Dentro do MySQL, cole (trocando a senha):
```sql
CREATE USER IF NOT EXISTS 'procar_app'@'localhost' IDENTIFIED BY 'UMA_SENHA_BEM_FORTE_AQUI';
CREATE DATABASE IF NOT EXISTS painel_procar CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON painel_procar.* TO 'procar_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Linha por linha:
- **`@'localhost'`** — o usuário **só** conecta de dentro deste servidor, nunca pela internet.
- **`utf8mb4`** — suporte completo a acentos. Obrigatório: o conteúdo do guia é todo em português.
- **`ON painel_procar.*`** — acesso total, **mas só a este banco**. Repare que é `painel_procar.*` e não `*.*`: essa diferença de dois caracteres é o que impede o usuário da aplicação de tocar em qualquer outra coisa no servidor.
- **Criar o banco aqui, e não deixar para o `db:setup`** — o driver do Node precisa que o banco já exista para conseguir conectar.

⚠️ **PORTÃO 7 — teste a conexão:**
```bash
mysql -u procar_app -p painel_procar -e "SELECT 'conexão ok' AS resultado;"
```
✅ **Deve aparecer:** uma tabelinha com `conexão ok`. Se der `Access denied`, revise a senha antes de seguir — esse mesmo valor vai para o `.env`.

### 7.4. `[A-23]` Tabelas de fuso horário do MySQL

Sem elas, o MySQL não entende nomes como `America/Sao_Paulo` (só deslocamentos numéricos), o que pode causar divergência de horário entre o que a aplicação grava e o que o monitoramento exibe.

```bash
sudo mysql_tzinfo_to_sql /usr/share/zoneinfo | sudo mysql mysql 2>/dev/null
sudo mysql -e "SELECT COUNT(*) AS fusos FROM mysql.time_zone_name;"
```
✅ **Deve aparecer:** um número na casa dos milhares.

### 7.5. Ajuste de memória (recomendado em planos de 2 GB)

```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```
Abaixo da linha `[mysqld]`, adicione:
```ini
innodb_buffer_pool_size = 256M
```
```bash
sudo systemctl restart mysql
```
Isso deixa mais RAM livre para o Node e para os builds, sem prejuízo perceptível no volume de dados do PROCAR.

---

## 8. Apontando o domínio (DNS)

### 8.1. Criar os registros

**Domínio na Hostinger:** hPanel → **Domínios → seu domínio → Zona DNS**.

| Tipo | Nome/Host | Aponta para | TTL |
|---|---|---|---|
| A | `@` | `SEU_IP_DA_VPS` | 3600 |
| A | `www` | `SEU_IP_DA_VPS` | 3600 |

O `@` representa o domínio "pelado"; o `www`, a versão com prefixo. Queremos os dois funcionando.

**Domínio em outro registrador:** crie os mesmos dois registros A lá, ou aponte os *nameservers* para a Hostinger.

### 8.2. `[A-22]` Verificar os DOIS nomes antes de seguir

⚠️ **PORTÃO 8.** O Certbot (Seção 14) emite o certificado para os dois nomes de uma vez: se **um** deles não resolver, **o processo inteiro falha** — e a mensagem não deixa claro qual dos dois é o problema.

No **seu computador**:
```bash
nslookup seudominio.com.br
nslookup www.seudominio.com.br
```
✅ **Deve aparecer:** o IP da sua VPS nos **dois** casos.

Ou, direto do servidor:
```bash
for h in seudominio.com.br www.seudominio.com.br; do
  echo -n "$h -> "; getent hosts "$h" | awk '{print $1}' | head -1
done
```

Mudanças de DNS levam de minutos a algumas horas para propagar. **Não avance sem os dois resolvendo.**

---

## 9. Organizando as pastas (o padrão que dá rollback instantâneo)

**Jeito ingênuo (que vamos evitar):** clonar numa pasta e, a cada atualização, rodar `git pull` + build ali mesmo. Durante os minutos do build, a pasta fica "meio antiga, meio nova" — e se o build falhar no meio, o sistema fica quebrado no ar, sem versão boa para onde voltar.

**Jeito que vamos usar:** cada atualização vai para uma **pasta nova** com data e hora no nome. Um atalho chamado `current` aponta para a versão ativa. Trocar de versão — ou voltar — é mudar o atalho. Instantâneo.

Pense num armário de caixas datadas e uma etiqueta "EM USO" que você move de caixa em caixa. A caixa antiga continua lá, intacta.

```bash
sudo mkdir -p /var/www/procar/{releases,shared/backend,shared/frontend,shared/logs}
sudo chown -R procar:procar /var/www/procar
```

```
/var/www/procar/
├── releases/                       ← as "caixas": uma por deploy
│   ├── 20260728143000/
│   └── 20260730091500/
├── shared/                         ← o que NÃO muda entre versões
│   ├── backend/.env                   (senhas e configurações)
│   ├── frontend/.env
│   └── logs/
└── current -> releases/20260730091500/   ← a etiqueta "EM USO"
```

O Nginx sempre serve de `current/frontend/dist`; o PM2 sempre roda `current/backend/dist/server.js`. Nenhum dos dois precisa saber qual versão está ativa.

---

## 10. `[A-02]` Acesso ao repositório no GitHub (procedimento completo)

Esta seção existe porque a v1 apenas mencionava "cadastre a chave no GitHub", sem mostrar como — e faltavam quatro etapas obrigatórias sem as quais o `git clone` falha, uma delas fazendo o `deploy.sh` **travar indefinidamente**.

### 10.1. Qual método usar

| Método | Alcance | Revogação | Veredito |
|---|---|---|---|
| **Deploy key** (por repositório, somente leitura) | Só este repositório, só leitura | Revoga sozinha | ✅ **Use esta** |
| **Personal Access Token na URL** | Todos os repositórios do usuário | Revogar afeta tudo que usa o token | ⚠️ Só se não puder usar deploy key |
| **Sua chave SSH pessoal copiada para a VPS** | Tudo a que você tem acesso no GitHub | — | ❌ **Nunca faça isso** |

Se o repositório for **público**, pule para 10.7 — basta clonar pela URL HTTPS, sem autenticação.

### 10.2. Gerar a chave de deploy **no servidor**

Faça como o usuário `procar` (não como root — o `deploy.sh` roda com este usuário):
```bash
ssh-keygen -t ed25519 -f ~/.ssh/deploy_procar -C "deploy-procar-vps" -N ""
```
| Parte | Significado |
|---|---|
| `-t ed25519` | Algoritmo recomendado atualmente. |
| `-f ~/.ssh/deploy_procar` | Nome do arquivo — separado da sua chave pessoal de acesso à VPS. |
| `-N ""` | Sem senha na chave. **Necessário aqui**: o deploy roda sem ninguém para digitar senha. A segurança vem de a chave ser somente-leitura e de estar só nesta máquina. |

### 10.3. `[A-02]` Ajustar as permissões

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/deploy_procar
chmod 644 ~/.ssh/deploy_procar.pub
```
Sem isso o SSH recusa a chave com `Permissions 0644 for 'deploy_procar' are too open` — e a mensagem não explica que basta ajustar o modo do arquivo.

### 10.4. `[A-02]` Criar o `~/.ssh/config` — o passo mais esquecido

Sem este arquivo, o SSH tenta a chave **padrão** (`id_ed25519`, que é a sua chave de acesso à VPS e **não** está cadastrada no GitHub) e o clone falha com `Permission denied (publickey)`.

```bash
cat >> ~/.ssh/config <<'EOF'

Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/deploy_procar
    IdentitiesOnly yes
EOF

chmod 600 ~/.ssh/config
```
O `IdentitiesOnly yes` é importante: obriga o SSH a usar **só** a chave indicada, em vez de tentar todas as que encontrar (o que pode estourar o `MaxAuthTries` do GitHub antes de chegar na certa).

### 10.5. `[A-02]` Registrar o GitHub em `known_hosts`

Sem isso, o primeiro clone para e pergunta *"Are you sure you want to continue connecting?"*. Na mão você digita `yes`; **dentro do `deploy.sh` o script trava para sempre**, sem mensagem clara.

```bash
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null
chmod 600 ~/.ssh/known_hosts
```

### 10.6. Cadastrar a chave no GitHub

Mostre a chave **pública**:
```bash
cat ~/.ssh/deploy_procar.pub
```
Copie a linha inteira (começa com `ssh-ed25519` e termina com `deploy-procar-vps`).

No GitHub, pelo navegador:
1. Abra o repositório do PROCAR.
2. **Settings** (aba do repositório, não a do seu perfil).
3. Menu lateral esquerdo → **Deploy keys**.
4. Botão **Add deploy key**.
5. **Title:** `VPS Hostinger - producao`
6. **Key:** cole a linha copiada.
7. **Allow write access:** ⚠️ **deixe DESMARCADO.** O servidor só precisa ler. Marcar essa opção permitiria que um servidor comprometido alterasse o seu código-fonte.
8. **Add key**.

> **Se você não tiver acesso a Settings do repositório** (não é o dono nem administrador), peça a quem tem, ou use uma chave SSH da sua própria conta em **Settings do perfil → SSH and GPG keys** — funciona, mas dá ao servidor acesso a tudo que você acessa. Prefira sempre a deploy key.

### 10.7. ⚠️ PORTÃO 10 — testar antes de clonar

```bash
ssh -T git@github.com
```
✅ **Deve aparecer:**
```
Hi usuario/procar! You've successfully authenticated, but GitHub does not provide shell access.
```
**Isso NÃO é erro**, apesar de parecer. A parte que importa é o `successfully authenticated`. O GitHub simplesmente não dá acesso a terminal — só a Git.

❌ **Se aparecer `Permission denied (publickey)`:**
| Verifique | Comando |
|---|---|
| O `~/.ssh/config` existe e aponta para a chave certa? | `cat ~/.ssh/config` |
| As permissões estão corretas? | `ls -l ~/.ssh/` (config e chave privada devem ser `-rw-------`) |
| A chave cadastrada no GitHub é a mesma da VPS? | `ssh-keygen -lf ~/.ssh/deploy_procar.pub` e compare o *fingerprint* com o exibido na página de Deploy keys |
| Está rodando como `procar`? | `whoami` |

Descubra a URL SSH do repositório: no GitHub, botão verde **Code** → aba **SSH**. O formato é:
```
git@github.com:USUARIO_OU_ORG/procar.git
```
**Anote — ela será usada na Seção 12 e dentro do `deploy.sh`.**

---

## 11. Variáveis de ambiente (.env)

Os `.env` ficam em `shared/`, fora de `releases/` — assim **não são recriados a cada atualização**. Configure uma vez.

### 11.1. Backend

```bash
nano /var/www/procar/shared/backend/.env
```
```bash
PORT=3333
NODE_ENV=production

DB_HOST=localhost
DB_PORT=3306
DB_USER=procar_app
DB_PASSWORD=A_SENHA_CRIADA_NA_SEÇÃO_7.3
DB_NAME=painel_procar

# Chave que assina os "crachás" de login. Gere na própria VPS (comando abaixo).
JWT_SECRET=COLE_AQUI_O_VALOR_GERADO
JWT_EXPIRES_IN=30m

# Senha do primeiro acesso do Admin (usada uma única vez pelo db:setup)
ADMIN_SENHA_INICIAL=UMA_SENHA_FORTE_QUE_SO_VOCE_SABE

# Endereço final do sistema — com https:// e SEM barra no fim
CORS_ORIGIN=https://seudominio.com.br

# Opcional — API v2 da FIPE funciona sem token (500 req/dia); só preencha se
# quiser o limite maior (1000/dia, cadastro grátis em fipe.parallelum.com.br).
# Usada só na Opção B da Seção 12.5 (importar veículos FIPE direto na VPS).
FIPE_SUBSCRIPTION_TOKEN=
```

Os pontos que mais geram dúvida:

- **`NODE_ENV=production` `[PROCAR]`** — não é decoração. É essa variável que faz o sistema (a) recusar subir com uma chave fraca, (b) **não criar as contas de teste** (`bmw@procar.com.br` e afins) e (c) marcar os cookies como `Secure`. Sem ela, você publicaria um sistema com contas de teste ativas.
- **`JWT_SECRET`** — quem conhece essa chave consegue **fabricar um crachá de administrador**. Gere na própria VPS e **nunca reaproveite** a de desenvolvimento (que já circulou no seu computador e talvez no Git):
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- **`ADMIN_SENHA_INICIAL`** — o sistema obriga a troca no primeiro acesso, mas entre a instalação e o seu primeiro login ela é uma porta válida. Use uma senha forte.
- **`CORS_ORIGIN`** — exatamente a URL final, com `https://`.

```bash
chmod 600 /var/www/procar/shared/backend/.env
ls -l /var/www/procar/shared/backend/.env
```
✅ **Deve aparecer:** `-rw------- 1 procar procar ...`
(`600` = só o dono lê e escreve. Como o arquivo contém a senha do banco e a chave de assinatura, isso não é opcional.)

### 11.2. Frontend

```bash
echo "VITE_API_URL=/api" > /var/www/procar/shared/frontend/.env
```
Como o site e a API estão no mesmo domínio, um caminho relativo basta — e funciona igual em `seudominio.com.br` e `www.seudominio.com.br`.

---

## 12. `[A-01]` Primeiro deploy — a estratégia de build correta

### 12.1. Por que a v1 falhava, e qual é o fluxo certo

A v1 mandava `npm ci --omit=dev` e logo depois `npm run build`. O `--omit=dev` remove o `typescript`, que é exatamente a ferramenta que o build precisa:
```
sh: 1: tsc: not found
```

**Estratégia adotada na v2: compilar no servidor com tudo instalado, e podar depois.** Comparação completa das alternativas está no `AUDITORIA-DEPLOY.md` (A-01); em resumo:

| Estratégia | Veredito para este projeto |
|---|---|
| **Instalar tudo → build → podar** | ✅ **Recomendada.** Zero infraestrutura extra; módulos nativos compilados na máquina de destino (arquitetura e bibliotecas de sistema corretas); o repositório é a única fonte de verdade. |
| CI/CD (GitHub Actions) enviando artefatos | ✅ Caminho de evolução, quando houver mais de uma pessoa publicando. |
| Docker multi-stage | ❌ Não agora. Adiciona uma camada operacional inteira (registry, volumes, backup do volume do banco) para rodar **uma** aplicação numa **única** VPS de 2 GB, e sobe muito a barreira para quem vai manter. |
| Mover `typescript` para `dependencies` | ❌ Antipadrão: compilador em produção. |

**A ordem correta, que este guia usa daqui em diante:**
```
npm ci --include=dev  →  npm run build  →  npm run db:setup  →  npm prune --omit=dev
```
Três detalhes que fazem isso funcionar sempre:
1. **`--include=dev` explícito.** O npm interpreta `NODE_ENV=production` como se fosse `--omit=dev`. Se o ambiente tiver essa variável, um `npm ci` "puro" voltaria a quebrar o build — de forma intermitente e difícil de diagnosticar.
2. **`npm prune --omit=dev`** em vez de um segundo `npm ci`: remove os pacotes de desenvolvimento da árvore já instalada, sem baixar nada de novo.
3. **A poda vem depois do `db:setup`** `[A-11]`: se esse script roda via `tsx`/`ts-node` (verificado no PORTÃO 0.3), ele é uma ferramenta de desenvolvimento e sumiria com a poda.

### 12.2. `[A-24]` Baixar o código

Faça **como o usuário `procar`** — clonar como root e usar como `procar` gera `detected dubious ownership in repository` nas operações Git seguintes.

```bash
whoami
```
✅ **Deve aparecer:** `procar`. Se aparecer `root`, saia com `exit` e entre de novo com `ssh procar@SEU_IP`.

```bash
TIMESTAMP=$(date +%Y%m%d%H%M%S)
echo "Release: $TIMESTAMP"
git clone git@github.com:USUARIO/procar.git /var/www/procar/releases/$TIMESTAMP
cd /var/www/procar/releases/$TIMESTAMP
```
✅ **Deve aparecer:** o progresso do clone e, ao final, `Resolving deltas: 100%`.

❌ **Se pedir senha ou der "Permission denied":** volte ao PORTÃO 10.

### 12.3. Backend: instalar, compilar e preparar o banco

```bash
ln -sf /var/www/procar/shared/backend/.env backend/.env
cd backend

# 1) Instala TUDO — o build precisa do compilador TypeScript
npm ci --include=dev

# 2) Compila TypeScript → JavaScript em dist/
npm run build
```
✅ **Deve aparecer:** o build termina sem erro e a pasta `dist/` existe:
```bash
ls dist/server.js
```

> **Se der erro de memória ("Killed", "JavaScript heap out of memory"):** confirme que o swap da Seção 3.6 está ativo (`free -h`). Se ainda assim faltar, aumente o limite do Node só para o build:
> ```bash
> NODE_OPTIONS=--max-old-space-size=1536 npm run build
> ```

### 12.4. Criar as tabelas e o conteúdo inicial

```bash
npm run db:setup
```
✅ **O que ele faz:**
1. Cria as tabelas: `usuarios`, `sessoes`, `cores`, `servicos`, `roteiro_etapas`, `regras`, `objecoes`, `atendimentos`, `usuario_marcas`, `reset_senha_log`.
2. Preenche o conteúdo do Manual de Vendas (roteiro, serviços, argumentos por cor, objeções).
3. Cria o administrador: **`admin@procar.com`**, com a senha de `ADMIN_SENHA_INICIAL`. **O primeiro login obriga a trocá-la.**

O script é **idempotente** — pode ser executado de novo com segurança, e aplica migrações pendentes sem duplicar dados. Você vai rodá-lo a cada atualização que mexa no banco.

> **`[PROCAR]` Contas de teste:** com `NODE_ENV=production`, as contas por marca (`bmw@procar.com.br` etc.) **não** são criadas, de propósito. Os consultores reais devem ser cadastrados pelo Admin na tela `/usuarios`.

Confira:
```bash
mysql -u procar_app -p painel_procar -e "SHOW TABLES; SELECT email, papel FROM usuarios;"
```

### 12.5. `[PROCAR]` Importar os veículos (tabelas FIPE)

⚠️ O `db:setup` **não** cria `vehicle_brands` e `vehicle_models` — elas vêm de uma importação separada da API da FIPE. **Sem elas o wizard não terá carros e o sistema fica inutilizável.**

Os scripts que fazem essa importação vêm **junto com o clone** do repositório, em `backend/src/database/import-fipe/` (não são mais um processo externo). São dois, mas só um entra no fluxo padrão de deploy:

| Script | Comando | Neste guia |
|---|---|---|
| Marcas + modelos | `npm run import:fipe:marcas` | ✅ Usado abaixo (Opção B) |
| Anos por modelo (`vehicle_years`) | `npm run import:fipe:anos` | ❌ **Fora do fluxo padrão** — ver nota abaixo |

> **Por que o de anos fica de fora:** ele faz uma chamada à API por modelo (milhares delas) e esbarra facilmente no limite de requisições da FIPE — não termina numa sessão só e não tem como fazer parte de um deploy confiável. Além disso, **nada no guia hoje lê `vehicle_years`** (a categoria do veículo vem direto de `vehicle_models.category`, não dessa tabela) — então pular esse script não tira nenhuma funcionalidade do sistema em produção. Se um dia quiser os anos mesmo assim, rode `npm run import:fipe:anos` manualmente, fora do deploy, com calma (passo a passo e tratamento do erro 429 documentados em [IMPORTACAO-FIPE.md](./IMPORTACAO-FIPE.md)).

**Opção A — você já tem os dados no seu banco local (caso mais comum).** No **seu computador**:
```bash
mysqldump -u root -p --no-tablespaces painel_procar vehicle_brands vehicle_models > veiculos.sql
scp veiculos.sql procar@SEU_IP:/var/www/procar/shared/
```
No **servidor**:
```bash
mysql -u procar_app -p painel_procar < /var/www/procar/shared/veiculos.sql
```

**Opção B — importar direto da FIPE na VPS** (primeira publicação sem base local, ou para atualizar o catálogo depois). Não exige nenhuma variável obrigatória — a API v2 da FIPE funciona sem token (`FIPE_SUBSCRIPTION_TOKEN` em `/var/www/procar/shared/backend/.env`, Seção 11.1, é opcional e só eleva o limite diário):
```bash
npm run import:fipe:marcas
```
É rápido (só marcas + modelos, sem a chamada por modelo que o script de anos faz) — não precisa de `screen` nem de retomada.

⚠️ **PORTÃO 12:**
```bash
mysql -u procar_app -p painel_procar -e "
  SELECT COUNT(*) AS marcas FROM vehicle_brands;
  SELECT COUNT(*) AS modelos FROM vehicle_models;"
```
✅ **Deve aparecer:** números bem acima de zero (milhares de modelos). Se vier zero, **não adianta seguir** — o sistema não funcionará.

### 12.6. Podar as dependências de desenvolvimento

Agora que o build e o setup terminaram:
```bash
cd /var/www/procar/releases/$TIMESTAMP/backend
npm prune --omit=dev
du -sh node_modules
```
Compare com o tamanho antes da poda — a redução costuma ser substancial.

### 12.7. `[A-25]` Frontend: compilar e limpar

```bash
cd /var/www/procar/releases/$TIMESTAMP/frontend
ln -sf /var/www/procar/shared/frontend/.env .env
npm ci --include=dev
npm run build
```
✅ **Deve aparecer:** ao final, a lista de arquivos gerados com seus tamanhos.

> **`[PROCAR]` Confira o tamanho.** O `CLAUDE.md` registra o bundle em torno de **98 KB comprimido**. Um número muito maior (o dobro, por exemplo) merece investigação antes de publicar: leveza é requisito não-funcional crítico, porque a internet nas lojas é ruim e o tablet baixa isso no primeiro acesso.

Agora remova o `node_modules` do frontend — **nada dele roda no servidor**, o Nginx serve apenas os arquivos estáticos já gerados:
```bash
rm -rf node_modules
```
São centenas de MB por release, multiplicados pelas 5 releases mantidas. É a maior economia de disco do sistema inteiro.

### 12.8. Ativar esta versão

```bash
ln -sfn /var/www/procar/releases/$TIMESTAMP /var/www/procar/current
ls -l /var/www/procar/current
```
✅ **Deve aparecer:** uma seta apontando para a pasta com o seu timestamp.

---

## 13. Nginx

### 13.1. `[A-21]` Limite de requisições

**`[PROCAR]` Por que é mais importante aqui que em outros projetos:** o backend roda como instância única. Se alguém disparar milhares de requisições, o Node satura e o sistema para para todo mundo. O Nginx segura essa onda antes de chegar no Node.

A v1 mandava editar `/etc/nginx/nginx.conf` — arquivo do sistema, que pode ser sobrescrito numa atualização do pacote. A pasta `conf.d/` já é incluída dentro do bloco `http {}` pelo Ubuntu, então basta:

```bash
sudo tee /etc/nginx/conf.d/procar-limits.conf > /dev/null <<'EOF'
# 10 requisições por segundo por endereço de internet.
# Folgado para o uso real do guia; suficiente para barrar abuso.
limit_req_zone $binary_remote_addr zone=procar_api:10m rate=10r/s;
EOF
```

### 13.2. `[A-09]` Cabeçalhos de segurança num arquivo reutilizável

**A regra do Nginx que pega quase todo mundo:** `add_header` definido num bloco pai é herdado pelo filho **apenas se o filho não definir nenhum `add_header` próprio**. Basta um `add_header` dentro de um `location` para que **todos** os cabeçalhos do `server` sejam descartados ali.

Na v1, os blocos de cache definiam `add_header Cache-Control` — o que fazia o `index.html` e **todos os arquivos JS/CSS** serem servidos **sem CSP, sem `X-Frame-Options`, sem `nosniff` e sem HSTS**. Ou seja, exatamente os arquivos que executam código no navegador ficavam desprotegidos, enquanto um teste na raiz mostrava tudo certo.

A solução é um arquivo incluído em todos os lugares que precisam:
```bash
sudo tee /etc/nginx/snippets/procar-security.conf > /dev/null <<'EOF'
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
EOF
```
> O `'unsafe-inline'` em `script-src` é necessário por causa do script de tema embutido no `index.html` (que evita o "piscar" de tema errado no carregamento). Se um dia esse script for movido para um arquivo externo, remova essa permissão.

### 13.3. A configuração do site

```bash
sudo nano /etc/nginx/sites-available/procar
```
```nginx
server {
    listen 80;
    server_name seudominio.com.br www.seudominio.com.br;

    root /var/www/procar/current/frontend/dist;
    index index.html;

    # Cabeçalhos de segurança para o bloco principal
    include /etc/nginx/snippets/procar-security.conf;

    # ---- Compressão ----
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/css text/plain application/javascript application/json image/svg+xml;

    # ---- Arquivos com hash no nome (o Vite gera nomes únicos por build) ----
    # Podem ficar guardados no tablet por muito tempo: se o conteúdo mudar,
    # o nome muda junto. Reduz muito o tráfego nos acessos seguintes.
    location ~* \.(js|css|svg|png|jpg|jpeg|webp|woff2?)$ {
        include /etc/nginx/snippets/procar-security.conf;   # [A-09] obrigatório
        expires 30d;
        add_header Cache-Control "public, immutable" always;
        access_log off;
    }

    # ---- O index.html NUNCA pode ser cacheado ----
    # É ele que aponta para os arquivos da versão atual. Se ficar velho no
    # tablet, o consultor continua vendo a versão antiga depois de um deploy.
    location = /index.html {
        include /etc/nginx/snippets/procar-security.conf;   # [A-09] obrigatório
        add_header Cache-Control "no-cache" always;
    }

    # ---- Rotas do React (SPA) ----
    # Sem esta linha, atualizar a página em /usuarios ou /gestor/uso daria 404.
    location / {
        try_files $uri $uri/ /index.html;
    }

    # ---- API: repassa para o Node ----
    location /api/ {
        limit_req zone=procar_api burst=20 nodelay;

        proxy_pass http://127.0.0.1:3333/api/;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    client_max_body_size 2M;
}
```

> **`[A-10]` Lembrete:** os cabeçalhos `X-Forwarded-*` acima só produzem efeito se o Express estiver com `app.set('trust proxy', 1)` (PORTÃO 0.5). Sem isso, o limite de tentativas de login trata **todos os usuários como um só**.

### 13.4. `[A-19]` Ativar

```bash
sudo ln -sfn /etc/nginx/sites-available/procar /etc/nginx/sites-enabled/procar
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
```
✅ **Deve aparecer:** `syntax is ok` e `test is successful`.
⚠️ **Nunca recarregue o Nginx sem rodar `nginx -t` antes** — com um erro de digitação ele não sobe e o site fica fora do ar.

```bash
sudo systemctl reload nginx
```
(`reload` aplica a configuração **sem derrubar** conexões em andamento; `restart` derruba. Prefira sempre `reload`.)

### 13.5. `[A-04]` Agora sim: jails do Nginx no Fail2Ban

Os arquivos de log do Nginx já existem, então as jails podem ser adicionadas:
```bash
sudo tee -a /etc/fail2ban/jail.local > /dev/null <<'EOF'

[nginx-http-auth]
enabled  = true
logpath  = /var/log/nginx/error.log

[nginx-limit-req]
enabled  = true
logpath  = /var/log/nginx/error.log
# Trabalha junto com o limit_req da Seção 13.1: quem estourar o limite
# repetidamente é banido no firewall.
EOF

sudo systemctl restart fail2ban
sudo fail2ban-client status
```
✅ **Deve aparecer:** `Jail list: nginx-http-auth, nginx-limit-req, sshd`

> Note que essas jails **não** levam `backend = systemd` — elas leem arquivos de log. Só o `sshd` usa o backend do systemd, pelo motivo explicado na Seção 6.1.

### 13.6. ⚠️ `[A-07]` NÃO teste o login ainda

Neste ponto o site abre em `http://seudominio.com.br` e as telas carregam. **Mas o login não vai funcionar — e isso é esperado.**

Motivo: com `NODE_ENV=production`, o cookie de sessão é marcado como `Secure`, e **nenhum navegador guarda cookie `Secure` numa página `http://`**. O sintoma é cruel: a tela aceita a senha e volta para o login, sem erro no console e sem nada nos logs do backend.

Isso já custou horas de gente caçando um bug de autenticação que não existe. **O primeiro teste de login está na Seção 16, depois do HTTPS.**

---

## 14. HTTPS com Let's Encrypt

⚠️ Confirme que o **PORTÃO 8** passou (os dois nomes resolvendo para o IP da VPS).

```bash
sudo certbot --nginx -d seudominio.com.br -d www.seudominio.com.br
```
Ele pede:
- **E-mail** — para avisos de expiração. Use um que você leia de verdade.
- **Aceitar os termos** — `Y`.
- **Compartilhar e-mail com a EFF** — `N`.

✅ **O que ele faz sozinho:** valida o domínio, emite o certificado, **reescreve a configuração do Nginx** para HTTPS com redirecionamento automático de `http://`, adiciona o cabeçalho HSTS e agenda a renovação.

### 14.1. Confirmar a renovação automática

Certificados valem 90 dias. Descobrir que a renovação nunca funcionou no dia em que ele expira é uma experiência ruim — confirme agora:

```bash
systemctl is-active certbot.timer
```
✅ `active`

```bash
sudo certbot renew --dry-run
```
✅ **Deve aparecer:** `Congratulations, all simulations of renewals succeeded`

Passando o *dry-run*, você não precisa fazer mais nada com certificados. (A manutenção mensal ainda inclui uma conferida rápida.)

### 14.2. Verificar que os cabeçalhos sobreviveram

```bash
curl -sI https://seudominio.com.br | grep -ci "content-security-policy"
curl -sI https://seudominio.com.br/index.html | grep -ci "content-security-policy"
```
✅ **Deve aparecer:** `1` nas **duas** linhas. Se a segunda vier `0`, o `include` do snippet no bloco `location = /index.html` está faltando (A-09).

---

## 15. `[A-14]` Backend no ar com o PM2

### 15.1. `[A-20]` Aviso antes de começar

**Nunca rode `sudo pm2 ...`.** Isso cria um **segundo** daemon do PM2, rodando como root, com a própria lista de processos. O sintoma clássico é enlouquecedor: `pm2 status` mostra a aplicação parada, mas ela está no ar (ou duas cópias competem pela porta 3333, e uma delas falha com `EADDRINUSE`).

Sempre como `procar`, sem `sudo`. Para conferir se há mais de um daemon:
```bash
pgrep -a -f "PM2\[" 
```
✅ **Deve aparecer:** no máximo uma linha, do usuário `procar`.

### 15.2. Arquivo de configuração

```bash
nano /var/www/procar/shared/ecosystem.config.js
```
```javascript
module.exports = {
  apps: [{
    name: 'procar-api',
    script: 'dist/server.js',
    cwd: '/var/www/procar/current/backend',

    // ⚠️ [PROCAR] NUNCA mude para modo cluster / instances > 1.
    // O throttle de login, o limite de requisições e o job de retenção
    // (limpeza dos atendimentos com mais de 60 dias) vivem na memória DESTE
    // processo. Com duas instâncias, os limites deixariam de valer e a
    // limpeza rodaria em duplicidade.
    instances: 1,
    exec_mode: 'fork',

    autorestart: true,
    max_memory_restart: '300M',   // reinicia sozinho se vazar memória
    kill_timeout: 5000,           // 5s para requisições em curso terminarem

    env: { NODE_ENV: 'production' },

    error_file: '/var/www/procar/shared/logs/error.log',
    out_file:   '/var/www/procar/shared/logs/out.log',
    time: true,                   // carimba data/hora em cada linha
  }],
};
```

### 15.3. Subir e garantir o retorno após reboot

```bash
pm2 start /var/www/procar/shared/ecosystem.config.js
pm2 status
```
✅ **Deve aparecer:** `procar-api`, status `online`, `mode: fork`, `↺ 0`.

```bash
pm2 startup
```
⚠️ Este comando **não faz nada sozinho** — ele **imprime** outro comando (longo, começando com `sudo env PATH=...`). **Copie a linha inteira, cole e execute.**

```bash
pm2 save
```

⚠️ **PORTÃO 15 — `[A-14]` a verificação que a v1 não tinha:**
```bash
systemctl is-enabled pm2-procar
```
✅ **Deve aparecer:** `enabled`

❌ **Se der `Failed to get unit file state` ou `disabled`:** o comando do `pm2 startup` não foi executado. Rode `pm2 startup` de novo e execute a linha que ele imprimir.

> **Por que isso é crítico:** sem esse passo, o sintoma só aparece semanas depois — o servidor reinicia (manutenção da Hostinger, queda de energia) e **o backend não volta**. O Nginx sobe, o site abre, e toda chamada de API dá erro 502.

### 15.4. Rotação dos logs

Sem isso, os arquivos de log crescem para sempre e um dia enchem o disco — derrubando MySQL, Nginx e tudo mais. É uma das causas mais comuns de "o servidor parou do nada" meses depois de uma instalação bem-feita.

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

---

## 16. `[A-07]` Validação funcional (agora sim)

### 16.1. Testes técnicos

```bash
# O backend responde localmente?
curl -s http://127.0.0.1:3333/api/health
```
✅ **Deve aparecer:** `{"status":"ok",...}`

```bash
# E através do Nginx, por HTTPS?
curl -s https://seudominio.com.br/api/health
```
✅ **Deve aparecer:** o mesmo JSON.

```bash
# O redirecionamento de HTTP para HTTPS funciona?
curl -sI http://seudominio.com.br | head -1
```
✅ **Deve aparecer:** `HTTP/1.1 301 Moved Permanently`

### 16.2. `[A-10]` Confirmar que o limite por IP funciona de verdade

```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code} " https://seudominio.com.br/api/health
done; echo
```
✅ **Deve aparecer:** vários `200` e, ao final, alguns `503`/`429` — sinal de que o limite está ativo. Se **todos** vierem `200`, revise a Seção 13.1.

### 16.3. Teste de reboot (obrigatório)

```bash
sudo reboot
```
Espere ~1 minuto, reconecte e confira:
```bash
pm2 status
systemctl is-active nginx mysql fail2ban
curl -s -o /dev/null -w "%{http_code}\n" https://seudominio.com.br
```
✅ **Deve aparecer:** `procar-api` online, três `active`, e `200`.

**Se algo não voltou sozinho, é agora que você quer descobrir** — não numa madrugada daqui a três meses.

### 16.4. Primeiro login e teste funcional completo

Faça de um **tablet de verdade**, na loja se possível:

1. Acesse `https://seudominio.com.br` — o cadeado deve aparecer.
2. Entre com `admin@procar.com` e a senha de `ADMIN_SENHA_INICIAL`.
3. O sistema **deve exigir** a troca de senha. Defina a definitiva.
4. Crie um usuário consultor de teste em `/usuarios` e anote a senha temporária.
5. Saia, entre como esse consultor e percorra o wizard inteiro: cliente → carro → modelo → cor → bancos → setor → canal.
6. Confirme que o guia é gerado com os serviços recomendados corretos.
7. Teste o botão **"Salvar em PDF"**.
8. **`[PROCAR]` Desligue o wi-fi do tablet** e navegue de novo pelo guia já carregado — ele deve continuar funcionando (cache offline é requisito central do projeto).
9. Religue, entre como gestor e confira `/gestor/uso` — os horários devem bater com o relógio local.
---

# PARTE B — OPERAÇÃO

## 17. `[A-13]` Atualizando o sistema

### 17.1. O que é possível, com honestidade

- **Frontend: downtime zero real.** A nova versão é compilada numa pasta separada e o atalho `current` é trocado no fim. Instantâneo.
- **Backend: alguns segundos.** O Node precisa reiniciar para carregar o código novo.
- **`[PROCAR]` E não dá para eliminar esses segundos do jeito convencional.** A técnica usual seria rodar várias instâncias e reiniciá-las uma a uma — mas este sistema **precisa** de instância única (Seção 1). Isso resolveria o downtime e criaria um buraco de segurança. Troca ruim.

**Ninguém é deslogado:** as sessões ficam na tabela `sessoes` do MySQL, não na memória do Node. E, pelo desenho offline-first, quem já está com um guia aberto nem depende do servidor naquele instante.

**Na prática:** atualize fora do horário de pico e os poucos segundos são irrelevantes.

### 17.2. O script de deploy

A v1 tinha três defeitos que só aparecem em execução real (A-13): quebrava no primeiro deploy pelo script, abortava se a aplicação ainda não estivesse no PM2 — **depois** de já ter trocado o `current` — e usava um `sleep 3` fixo que podia reverter um deploy que estava bom. Tudo corrigido abaixo.

```bash
nano /var/www/procar/deploy.sh
```
```bash
#!/bin/bash
set -euo pipefail
# -e: para na primeira falha  |  -u: acusa variável não definida
# -o pipefail: detecta falha no meio de uma sequência de comandos

APP_DIR=/var/www/procar
REPO_URL="git@github.com:USUARIO/procar.git"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
RELEASE_DIR="$APP_DIR/releases/$TIMESTAMP"
MANTER_RELEASES=5

# [A-13] Se algo falhar durante o build, remove a pasta pela metade em vez
# de deixar lixo acumulando em disco.
limpar_em_caso_de_falha() {
  if [ -d "$RELEASE_DIR" ] && [ "$(readlink -f "$APP_DIR/current" || true)" != "$RELEASE_DIR" ]; then
    echo "Removendo release incompleta: $RELEASE_DIR"
    rm -rf "$RELEASE_DIR"
  fi
}
trap limpar_em_caso_de_falha ERR

echo "==> [1/8] Backup do banco antes de qualquer migração"
"$APP_DIR/shared/backup-db.sh"

echo "==> [2/8] Baixando a versão nova (release $TIMESTAMP)"
git clone --depth 1 "$REPO_URL" "$RELEASE_DIR"

echo "==> [3/8] Ligando as configurações (.env)"
ln -sf "$APP_DIR/shared/backend/.env"  "$RELEASE_DIR/backend/.env"
ln -sf "$APP_DIR/shared/frontend/.env" "$RELEASE_DIR/frontend/.env"

echo "==> [4/8] Backend: instalando TUDO e compilando"
cd "$RELEASE_DIR/backend"
npm ci --include=dev          # [A-01] --include=dev explícito: o build precisa do tsc
npm run build

echo "==> [5/8] Migrações e conteúdo (antes da poda — [A-11])"
npm run db:setup
npm prune --omit=dev          # [A-01] agora sim remove as ferramentas de dev

echo "==> [6/8] Frontend: compilando e limpando"
cd "$RELEASE_DIR/frontend"
npm ci --include=dev
npm run build
rm -rf node_modules           # [A-25] nada do frontend roda no servidor

# [A-13] Guarda a versão atual ANTES de trocar, para poder reverter
VERSAO_ANTERIOR=""
if [ -L "$APP_DIR/current" ]; then
  VERSAO_ANTERIOR=$(readlink -f "$APP_DIR/current")
fi

echo "==> [7/8] Ativando a versão nova"
ln -sfn "$RELEASE_DIR" "$APP_DIR/current"

# [A-13] Se a aplicação ainda não estiver registrada no PM2, registra
if pm2 describe procar-api > /dev/null 2>&1; then
  pm2 restart procar-api --update-env
else
  pm2 start "$APP_DIR/shared/ecosystem.config.js"
fi

echo "==> [8/8] Verificando a saúde do sistema"
# [A-13] Tenta por até 30s, saindo assim que responder — em vez de um
# sleep fixo que pode reverter um deploy perfeitamente bom.
SAUDAVEL=0
for i in $(seq 1 15); do
  if curl -sf --max-time 2 http://127.0.0.1:3333/api/health > /dev/null 2>&1; then
    SAUDAVEL=1; break
  fi
  sleep 2
done

if [ "$SAUDAVEL" -eq 1 ]; then
  echo ""
  echo "✅ Deploy concluído. Versão no ar: $TIMESTAMP"
else
  echo ""
  echo "❌ O sistema NÃO respondeu em 30 segundos."
  if [ -n "$VERSAO_ANTERIOR" ]; then
    echo "   Revertendo para: $VERSAO_ANTERIOR"
    ln -sfn "$VERSAO_ANTERIOR" "$APP_DIR/current"
    pm2 restart procar-api --update-env
    echo "↩️  Revertido."
  else
    echo "   Não há versão anterior para reverter (primeiro deploy)."
  fi
  echo "   Investigue com: pm2 logs procar-api --lines 50 --nostream"
  exit 1
fi

echo "==> Limpando releases antigas (mantendo $MANTER_RELEASES)"
cd "$APP_DIR/releases"
ls -1t | tail -n "+$((MANTER_RELEASES + 1))" | while read -r antiga; do
  if [ "$(readlink -f "$APP_DIR/current")" != "$APP_DIR/releases/$antiga" ]; then
    rm -rf "$antiga"
  fi
done
echo "Pronto."
```

```bash
chmod +x /var/www/procar/deploy.sh
```

**A partir de agora, atualizar é um comando só:**
```bash
/var/www/procar/deploy.sh
```

### 17.3. Rollback manual

```bash
ls -1t /var/www/procar/releases
ln -sfn /var/www/procar/releases/TIMESTAMP_ANTERIOR /var/www/procar/current
pm2 restart procar-api --update-env
```
Segundos, sem recompilar nada.

> **Atenção com o banco.** O rollback volta o *código*, não os *dados*. Se a versão nova adicionou colunas, elas continuam lá (normalmente sem problema — o código antigo as ignora). Mas se uma atualização **apagar ou renomear** algo, o rollback sozinho não basta: será preciso restaurar o backup (Seção 18.6). Por isso o `deploy.sh` faz backup automático antes de cada `db:setup`.

### 17.4. `[A-28]` Verificação pré-deploy (opcional, recomendada)

Um script que confere os pré-requisitos **antes** de começar, em vez de você descobrir no meio:

```bash
nano /var/www/procar/verificar.sh
```
```bash
#!/bin/bash
echo "=== Verificação pré-deploy ==="
ok() { echo "  ✅ $1"; }
falha() { echo "  ❌ $1"; ERRO=1; }
ERRO=0

ssh -T -o BatchMode=yes -o ConnectTimeout=5 git@github.com 2>&1 \
  | grep -q "successfully authenticated" \
  && ok "Acesso ao GitHub" || falha "Sem acesso ao GitHub (veja a Seção 10)"

[ -r /var/www/procar/shared/backend/.env ] \
  && ok ".env do backend acessível" || falha ".env do backend não encontrado"

mysql --defaults-extra-file=/var/www/procar/shared/.my.cnf painel_procar \
  -e "SELECT 1" > /dev/null 2>&1 \
  && ok "Conexão com o banco" || falha "Banco inacessível"

LIVRE=$(df --output=avail -BG / | tail -1 | tr -dc '0-9')
[ "$LIVRE" -ge 3 ] && ok "Disco livre: ${LIVRE}G" || falha "Pouco disco: ${LIVRE}G (mínimo 3G)"

pm2 describe procar-api > /dev/null 2>&1 \
  && ok "Aplicação registrada no PM2" || echo "  ⚠️  Ainda não registrada (normal no 1º deploy)"

echo ""
[ "$ERRO" -eq 0 ] && echo "Tudo pronto para o deploy." \
                  || echo "Resolva os itens ❌ antes de rodar o deploy.sh"
exit $ERRO
```
```bash
chmod +x /var/www/procar/verificar.sh
```

### 17.5. Caminho de evolução: CI/CD com GitHub Actions

Quando houver mais de uma pessoa publicando, vale automatizar. O modelo mais simples mantém a estratégia de build atual e só troca **quem dispara** o deploy:

```yaml
# .github/workflows/deploy.yml
name: Deploy para produção
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Publicar na VPS
        uses: appleboy/ssh-action@v1
        with:
          host:     ${{ secrets.VPS_HOST }}
          username: procar
          key:      ${{ secrets.VPS_SSH_KEY }}
          script:   /var/www/procar/deploy.sh
```
São necessários dois *secrets* no repositório (**Settings → Secrets and variables → Actions**): `VPS_HOST` (o IP) e `VPS_SSH_KEY` (uma chave privada **criada só para isso**, com a pública em `/home/procar/.ssh/authorized_keys`).

> **Por que não enviar o `dist/` já compilado do runner:** a VPS precisaria instalar as dependências de produção de qualquer forma, e enviar `node_modules` pronto só é seguro se o runner tiver exatamente o mesmo sistema, arquitetura e versão maior do Node — e mesmo assim quebra com módulos que compilam código nativo. Compilar na máquina de destino elimina essa classe inteira de problemas.

---

## 18. Backups

Backup tem três etapas, e a maioria só faz a primeira:
1. **Gerar** a cópia. (todo mundo faz)
2. **Guardar fora do servidor.** (metade esquece — e um backup que mora só na VPS some junto com ela)
3. **Testar a restauração.** (quase ninguém faz — e backup nunca testado é esperança, não garantia)

### 18.1. Credencial protegida

```bash
nano /var/www/procar/shared/.my.cnf
```
```ini
[client]
user=procar_app
password=A_SENHA_DO_BANCO
```
```bash
chmod 600 /var/www/procar/shared/.my.cnf
```
**Por que não colocar `-p'senha'` direto no script:** a senha ficaria visível na lista de processos do sistema — qualquer usuário logado a veria com `ps aux`.

### 18.2. `[A-06]` `[A-29]` Backup do banco — com a correção mais importante da auditoria

```bash
sudo mkdir -p /var/backups/procar && sudo chown procar:procar /var/backups/procar
nano /var/www/procar/shared/backup-db.sh
```
```bash
#!/bin/bash
set -euo pipefail
DATA=$(date +%Y-%m-%d_%H%M)
DEST=/var/backups/procar
ARQ="$DEST/db-$DATA.sql.gz"
mkdir -p "$DEST"

# [A-06] --no-tablespaces é OBRIGATÓRIO: sem ele, o mysqldump 8.0 exige o
# privilégio global PROCESS, que o usuário procar_app (corretamente) não tem.
# O erro seria "Access denied; you need the PROCESS privilege" — e como isto
# roda por cron às 3h da manhã, o backup falharia em SILÊNCIO por meses.
mysqldump --defaults-extra-file=/var/www/procar/shared/.my.cnf \
          --single-transaction --quick --no-tablespaces \
          --routines --triggers --events \
          painel_procar | gzip > "$ARQ"

# [A-29] Validação: um backup corrompido é pior que nenhum, porque cria
# confiança falsa. Confere integridade do gzip e a marca de fim de dump.
if ! gzip -t "$ARQ" 2>/dev/null; then
  echo "ERRO: backup corrompido (gzip inválido): $ARQ" >&2; exit 1
fi
if ! gunzip -c "$ARQ" | tail -5 | grep -q "Dump completed"; then
  echo "ERRO: backup incompleto (sem marca de conclusão): $ARQ" >&2; exit 1
fi

TAM=$(du -h "$ARQ" | cut -f1)
echo "$(date '+%F %T') OK  banco: $ARQ ($TAM)"

find "$DEST" -name "db-*.sql.gz" -mtime +14 -delete
```

### 18.3. Backup das configurações

```bash
nano /var/www/procar/shared/backup-files.sh
```
```bash
#!/bin/bash
set -euo pipefail
DATA=$(date +%Y-%m-%d_%H%M)
DEST=/var/backups/procar
ARQ="$DEST/config-$DATA.tar.gz"
mkdir -p "$DEST"

tar -czf "$ARQ" \
  /var/www/procar/shared/backend/.env \
  /var/www/procar/shared/frontend/.env \
  /var/www/procar/shared/ecosystem.config.js \
  /etc/nginx/sites-available/procar \
  /etc/nginx/snippets/procar-security.conf \
  /etc/nginx/conf.d/procar-limits.conf \
  /etc/fail2ban/jail.local \
  2>/dev/null || true

gzip -t "$ARQ" || { echo "ERRO: backup de config corrompido" >&2; exit 1; }
echo "$(date '+%F %T') OK  config: $ARQ"

find "$DEST" -name "config-*.tar.gz" -mtime +14 -delete
```

```bash
chmod +x /var/www/procar/shared/backup-db.sh /var/www/procar/shared/backup-files.sh
```

⚠️ **PORTÃO 18 — teste agora, na mão:**
```bash
/var/www/procar/shared/backup-db.sh
/var/www/procar/shared/backup-files.sh
ls -lh /var/backups/procar/
```
✅ **Deve aparecer:** duas linhas `OK` e dois arquivos com tamanho maior que zero.

### 18.4. Guardar fora do servidor

**Opção A — Snapshot da VPS pelo hPanel (mais fácil).** Verifique em **VPS → Backups** se está ativo e com que frequência. Excelente para "o servidor pegou fogo" — mas **não substitui** o dump do banco, que permite restaurar só os dados, de forma seletiva, em qualquer outro lugar. Use os dois.

**Opção B — Copiar para outra máquina sua:**
```bash
rsync -az /var/backups/procar/ usuario@outra-maquina:/backups/procar/
```
(Exige chave SSH sem senha do usuário `procar` para a máquina de destino.)

**Opção C — Nuvem (Object Storage da Hostinger, Backblaze B2, S3):**
```bash
sudo apt install -y rclone
rclone config      # assistente interativo
rclone copy /var/backups/procar remoto:procar-backups
```

### 18.5. Agendar (cron)

```bash
crontab -e
```
(Na primeira vez ele pergunta o editor — escolha `nano`, opção 1.)

```
# Backup do banco às 3h00
0 3 * * * /var/www/procar/shared/backup-db.sh >> /var/www/procar/shared/logs/backup.log 2>&1

# Backup das configurações às 3h05
5 3 * * * /var/www/procar/shared/backup-files.sh >> /var/www/procar/shared/logs/backup.log 2>&1

# Cópia externa às 3h15 (ajuste à opção escolhida)
15 3 * * * rsync -az /var/backups/procar/ usuario@outra-maquina:/backups/procar/ >> /var/www/procar/shared/logs/backup.log 2>&1
```

**Como ler uma linha de cron:** os cinco campos são `minuto hora dia-do-mês mês dia-da-semana`; `*` = "todos". Então `0 3 * * *` = 3h da manhã, todo dia.

```bash
crontab -l
```

### 18.6. Testar a restauração

```bash
# 1. Escolha um backup recente
ls -lt /var/backups/procar/db-*.sql.gz | head -3

# 2. Banco temporário de teste
sudo mysql -e "CREATE DATABASE painel_procar_teste;"

# 3. Restaure (troque pela data do arquivo escolhido)
gunzip -c /var/backups/procar/db-2026-07-30_0300.sql.gz | sudo mysql painel_procar_teste

# 4. Confira que os dados vieram
sudo mysql painel_procar_teste -e "
  SELECT COUNT(*) AS usuarios FROM usuarios;
  SELECT COUNT(*) AS servicos FROM servicos;
  SELECT COUNT(*) AS etapas   FROM roteiro_etapas;
  SELECT COUNT(*) AS modelos  FROM vehicle_models;"

# 5. Limpe
sudo mysql -e "DROP DATABASE painel_procar_teste;"
```
✅ **Deve aparecer:** números coerentes com a produção. Zero em alguma tabela = backup incompleto; investigue **agora**.

**Restauração real, em emergência:**
```bash
pm2 stop procar-api
/var/www/procar/shared/backup-db.sh   # preserva o estado atual, mesmo ruim
gunzip -c /var/backups/procar/db-DATA.sql.gz | mysql --defaults-extra-file=/var/www/procar/shared/.my.cnf painel_procar
pm2 start procar-api && pm2 status
```

---

# PARTE C — MANUTENÇÃO

> Um servidor bem instalado e nunca mais olhado degrada em silêncio: o disco enche, os certificados vencem, as vulnerabilidades se acumulam, os backups param sem avisar. As rotinas abaixo levam poucos minutos e evitam praticamente todos os problemas que derrubam sistemas em produção.

## 19. `[A-27]` Painel de saúde

```bash
nano /var/www/procar/saude.sh
```
```bash
#!/bin/bash
# Painel de saúde do PROCAR — rode com: /var/www/procar/saude.sh
DOMINIO="seudominio.com.br"     # <-- TROQUE

echo "════════════════════════════════════════════════════"
echo "  SAÚDE DO PROCAR   $(date '+%d/%m/%Y %H:%M')"
echo "════════════════════════════════════════════════════"

echo ""
echo "── SERVIÇOS ────────────────────────────────────────"
for s in nginx mysql fail2ban; do
  printf "  %-10s %s\n" "$s" "$(systemctl is-active $s)"
done
# [A-27] jq em vez de grep numa string JSON (frágil e quebrável)
printf "  %-10s %s\n" "backend" \
  "$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="procar-api") | .pm2_env.status' || echo 'ausente')"
printf "  %-10s %s\n" "reinícios" \
  "$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="procar-api") | .pm2_env.restart_time' || echo '?')"
printf "  %-10s %s\n" "boot" "$(systemctl is-enabled pm2-procar 2>/dev/null || echo 'NÃO CONFIGURADO')"

echo ""
echo "── RECURSOS ────────────────────────────────────────"
df -h /   | awk 'NR==2 {printf "  Disco: %s de %s usados (%s)\n", $3, $2, $5}'
free -h   | awk '/Mem:/  {printf "  RAM:   %s de %s\n", $3, $2}'
free -h   | awk '/Swap:/ {printf "  Swap:  %s de %s\n", $3, $2}'

echo ""
echo "── CERTIFICADO ─────────────────────────────────────"
sudo certbot certificates 2>/dev/null | grep -E "Certificate Name|Expiry Date" | sed 's/^/  /'

echo ""
echo "── BACKUPS (3 mais recentes) ───────────────────────"
ls -lht /var/backups/procar/ 2>/dev/null | sed -n '2,4p' | awk '{printf "  %-28s %s %s %s\n", $9, $6, $7, $5}'

echo ""
echo "── SEGURANÇA ───────────────────────────────────────"
sudo fail2ban-client status sshd 2>/dev/null | grep -E "Currently banned|Total banned" | sed 's/^/  /'

echo ""
echo "── ÚLTIMOS ERROS DO BACKEND ────────────────────────"
tail -5 /var/www/procar/shared/logs/error.log 2>/dev/null | sed 's/^/  /' || echo "  (nenhum)"

echo ""
echo "── SITE ────────────────────────────────────────────"
echo "  raiz:   HTTP $(curl -s -o /dev/null -w '%{http_code}' https://$DOMINIO)"
echo "  health: HTTP $(curl -s -o /dev/null -w '%{http_code}' https://$DOMINIO/api/health)"
echo "  CSP no index.html: $(curl -sI https://$DOMINIO/index.html | grep -ci 'content-security-policy') (esperado: 1)"

echo ""
echo "════════════════════════════════════════════════════"
```
```bash
chmod +x /var/www/procar/saude.sh
/var/www/procar/saude.sh
```

**Como ler o resultado:**

| Item | Situação boa | Se estiver diferente |
|---|---|---|
| Serviços | todos `active` / `online` | Seção 22 |
| Reinícios | um número que **não cresce** entre semanas | Backend caindo e voltando — veja os logs |
| `boot` | `enabled` | O `pm2 startup` não foi concluído (Seção 15.3) |
| Disco | abaixo de 80% | Seção 20.3 |
| Swap | próximo de zero | Alto sempre = RAM apertada; considere aumentar o plano |
| Certificado | validade > 30 dias | Seção 22 |
| Backups | arquivos de hoje/ontem | O cron parou — veja `shared/logs/backup.log` |
| CSP no index.html | `1` | Snippet de segurança faltando (A-09) |
| HTTP | `200` nos dois | Seção 22 |

---

## 20. Rotinas de manutenção

### 20.1. Semanal (5 minutos)

Coloque um lembrete recorrente no celular — é a única forma de isso realmente acontecer.

```bash
/var/www/procar/saude.sh
pm2 logs procar-api --lines 50 --nostream
```

**O que procurar nos logs:**
| Sinal | Significado |
|---|---|
| Erros repetidos de conexão com o banco | Problema no MySQL ou credencial mudada |
| Muitos `429`/`503` | Alguém batendo demais na API (abuso ou bug no cliente) |
| `undefined` / `cannot read property` | Bug na aplicação — anote e reporte no repositório |
| Nada de anormal | Terminou |

- [ ] `saude.sh` limpo
- [ ] Reinícios não aumentaram
- [ ] Backups de ontem existem
- [ ] Nenhum erro novo e repetitivo

### 20.2. Mensal (30-45 minutos)

Dia fixo, fora do horário das lojas.

**Atualizações do sistema:**
```bash
sudo apt update && apt list --upgradable
sudo apt upgrade -y && sudo apt autoremove -y
[ -f /var/run/reboot-required ] && echo "REINÍCIO NECESSÁRIO" || echo "sem necessidade"
```
Se disser que é necessário, reinicie **agora**, no horário controlado que você escolheu — não deixe para quando o servidor decidir travar sozinho:
```bash
sudo reboot
# depois: /var/www/procar/saude.sh
```

**Vulnerabilidades das dependências:**
```bash
cd /var/www/procar/current/backend  && npm audit --omit=dev
cd /var/www/procar/current/frontend && npm audit --package-lock-only
```
⚠️ **Não rode `npm audit fix --force` no servidor** — pode atualizar bibliotecas para versões incompatíveis e quebrar o sistema. Corrija no ambiente de desenvolvimento, teste, e publique pelo `deploy.sh`.
(No frontend usamos `--package-lock-only` porque o `node_modules` foi removido após o build.)

### 20.3. Espaço em disco

```bash
df -h /
```
Acima de 80%? Descubra o culpado:
```bash
sudo ncdu /     # navegue com as setas, "q" para sair
```
Suspeitos, em ordem:
```bash
# 1. Releases antigas
du -sh /var/www/procar/releases/*
cd /var/www/procar/releases && ls -1t | tail -n +4 | xargs -r rm -rf

# 2. Backups acumulados
du -sh /var/backups/procar

# 3. Logs
du -sh /var/log /var/www/procar/shared/logs

# 4. Cache do npm (cresce em silêncio)
npm cache clean --force
```

### 20.4. Certificado e usuários

```bash
sudo certbot certificates
```
✅ `VALID: XX days` com número acima de 30.

**`[PROCAR]` Revisão dos usuários** (manutenção da *aplicação*, fácil de esquecer):
1. Entre como Admin em **/usuarios**.
2. **Desative** contas de consultores que saíram. (Desativar > apagar: o histórico continua íntegro e o middleware revoga a sessão imediatamente.)
3. Confira se algum Gestor está com lojas a mais ou a menos.
4. Olhe **/gestor/uso**: consultores "sem uso recente" podem ser gente que saiu — ou um tablet com problema na loja. Vale um telefonema.

### 20.5. Checklist mensal

- [ ] `apt upgrade` aplicado; reiniciei se foi necessário
- [ ] `npm audit` revisado
- [ ] Disco abaixo de 80%
- [ ] Certificado com > 30 dias
- [ ] Usuários revisados em `/usuarios`
- [ ] Teste de restauração de backup (Seção 18.6)
- [ ] `saude.sh` limpo ao final

---

## 21. Trimestral e anual

### Trimestral (meio período)

- **Testar o rollback de verdade.** Rode um deploy e volte para a versão anterior (Seção 17.3). Testar o plano de emergência antes da emergência é o que separa um susto de um desastre.
- **Revisar as pendências do projeto** no `CLAUDE.md` ("Próximos Passos") e no `SECURITY-REVIEW.md`. Itens que costumam ficar em aberto: rotação do `JWT_SECRET`, custo do bcrypt, validade para senhas temporárias, tabela de auditoria geral.
- **Rotacionar o `JWT_SECRET`**, se for a decisão: gere uma chave nova, atualize o `.env`, reinicie. ⚠️ **Efeito esperado:** todo mundo é deslogado. Faça fora do horário comercial e avise as lojas.
- **Revisar o dimensionamento da VPS.** O swap ficou muito usado? A CPU passou de 70%? Considere subir de plano. Ocioso o trimestre inteiro = bem dimensionado.
- **Revisar os banimentos:** `sudo fail2ban-client status sshd`.

### Anual

- **Confirmar a renovação do domínio.** Domínio expirado derruba DNS e HTTPS de uma vez, e a recuperação pode levar dias. Marque com 60 dias de antecedência.
- **Planejar a atualização do Node.js.** Se ficou no 22, o suporte encerra em **abril de 2027** — planeje a migração para o 24 com meses de folga, testando antes.
- **Ubuntu 24.04:** suporte padrão até **abril de 2029**. Sem pressa, mas registre.
- **Refazer o checklist completo** (Seção 23) do zero, como auditoria nova.
- **Revisar quem tem acesso:**
  ```bash
  cat /home/procar/.ssh/authorized_keys   # chaves com acesso ao servidor
  getent group sudo                        # quem tem poder de administrador
  ```
  E, no GitHub, **Settings → Deploy keys**: remova chaves de servidores que não existem mais.

---

## 22. Diagnóstico rápido

Comece **sempre** por:
```bash
/var/www/procar/saude.sh
```

### "O site não abre de jeito nenhum"
```bash
systemctl is-active nginx
sudo nginx -t                     # erro de digitação na configuração?
sudo tail -30 /var/log/nginx/error.log
sudo ufw status
```
**Causa mais comum:** alguém editou a configuração, não rodou `nginx -t` e recarregou. O Nginx não sobe com erro de sintaxe.

### "O site abre, mas o login/geração de guia falha (erro 502 ou 503)"
```bash
pm2 status
pm2 logs procar-api --lines 50 --nostream
curl -I http://127.0.0.1:3333/api/health
pgrep -a -f "PM2\["              # [A-20] há mais de um daemon PM2?
```
**Causas comuns:** backend caiu; perdeu conexão com o banco; ou existe um segundo daemon PM2 rodando como root com uma cópia concorrente na mesma porta.

### "O login aceita a senha e volta para a tela de login"
`[A-07]` Verifique se você está acessando por **`https://`**. Com `NODE_ENV=production` o cookie é `Secure` e o navegador não o guarda em `http://`. Não há erro no console nem nos logs — o sintoma é exatamente esse.

### "Todos os consultores foram bloqueados de uma vez"
`[A-10]` Sinal clássico de `trust proxy` ausente: o Express está contando todo mundo como o mesmo IP.
```bash
grep -rn "trust proxy" /var/www/procar/current/backend/src/
```
Se não retornar nada, aplique o PORTÃO 0.5 e publique.

### "Erro de conexão com o banco"
```bash
systemctl is-active mysql
mysql --defaults-extra-file=/var/www/procar/shared/.my.cnf painel_procar -e "SELECT 1;"
sudo systemctl start mysql
sudo journalctl -u mysql -n 30 --no-pager
```
**Causa mais comum:** disco cheio. O MySQL para quando não consegue escrever. `df -h`.

### "Os backups pararam / nunca funcionaram"
`[A-06]`
```bash
tail -20 /var/www/procar/shared/logs/backup.log
/var/www/procar/shared/backup-db.sh
```
Se aparecer `Access denied ... PROCESS privilege`, falta o `--no-tablespaces` no script.

### "O cadeado sumiu"
```bash
sudo certbot certificates
sudo certbot renew --dry-run
```
Quase sempre: o domínio deixou de apontar para este IP, ou a porta 80 foi fechada (o Let's Encrypt precisa dela para validar).

### "O sistema está lento"
```bash
htop        # "q" para sair. Qual processo está no topo?
free -h     # swap muito usado = falta de RAM
df -h
```
**`[PROCAR]` Se a lentidão for só numa loja**, provavelmente não é o servidor — é a internet local. O PROCAR foi feito com cache no dispositivo justamente por isso; um tablet que já carregou o guia não deveria depender da rede para navegar entre veículos. Confira se o navegador daquele tablet não está em modo anônimo ou com cache desativado.

### "Não consigo mais entrar por SSH"
1. Use o **terminal do navegador do hPanel** — não depende da sua configuração de SSH.
2. Você pode ter sido banido pelo próprio Fail2Ban:
   ```bash
   sudo fail2ban-client status sshd
   sudo fail2ban-client set sshd unbanip SEU_IP
   ```
3. `systemctl is-active ssh`

### "Preciso desfazer a última atualização, agora"
```bash
ls -1t /var/www/procar/releases
ln -sfn /var/www/procar/releases/TIMESTAMP_ANTERIOR /var/www/procar/current
pm2 restart procar-api --update-env
```

---

## 23. Checklist final antes de entregar

**Pré-requisitos do código (PORTÃO 0)**
- [ ] `package-lock.json` versionado nos dois projetos
- [ ] Nenhum `.env` no Git
- [ ] Rota `GET /api/health` existe e responde sem login
- [ ] `app.set('trust proxy', 1)` presente no backend

**Acesso e segurança**
- [ ] Entro como `procar` (não `root`) e por chave SSH (não senha)
- [ ] `sudo sshd -t` passa; `PermitRootLogin no` e `PasswordAuthentication no` aplicados
- [ ] Firewall do hPanel **e** UFW liberam só 22, 80 e 443
- [ ] Fail2Ban com as três jails (`sudo fail2ban-client status`)
- [ ] `unattended-upgrades` ativo
- [ ] Swap ativo e permanente
- [ ] Fuso `America/Sao_Paulo` e hostname corretos

**Aplicação**
- [ ] `NODE_ENV=production` no `.env`
- [ ] `JWT_SECRET` aleatório, 32+ caracteres, gerado na própria VPS
- [ ] `.env` (x2) e `.my.cnf` com `chmod 600`
- [ ] Primeiro login feito e **senha do Admin trocada**
- [ ] Sem contas de teste: `mysql --defaults-extra-file=/var/www/procar/shared/.my.cnf painel_procar -e "SELECT email FROM usuarios WHERE email LIKE '%@procar.com.br';"` → vazio
- [ ] MySQL com usuário `procar_app`, restrito a `painel_procar.*`
- [ ] Tabelas FIPE populadas
- [ ] Backend em `fork`, **1 instância**; apenas **um** daemon PM2 (`pgrep -a -f "PM2\["`)
- [ ] `systemctl is-enabled pm2-procar` → `enabled`

**Rede e entrega**
- [ ] Os **dois** domínios abrem com cadeado
- [ ] `http://` redireciona para `https://`
- [ ] `certbot renew --dry-run` passa
- [ ] Cabeçalhos de segurança na raiz **e num arquivo estático**:
      `curl -sI https://SEUDOMINIO/index.html | grep -ci "content-security-policy"` → `1`
- [ ] Limite por IP ativo (Seção 16.2)
- [ ] Portas 3306 e 3333 inacessíveis de fora

**Teste funcional (num tablet real)**
- [ ] Login de consultor; primeiro acesso exige troca de senha
- [ ] Wizard completo: cliente → carro → modelo → cor → bancos → setor → canal
- [ ] Guia gerado com os serviços recomendados corretos
- [ ] "Salvar em PDF" funciona
- [ ] **Com o wi-fi desligado, o guia continua funcionando**
- [ ] `/gestor/uso` com horários corretos
- [ ] Admin cria usuário e reseta senha em `/usuarios`

**Continuidade**
- [ ] `verificar.sh` e `deploy.sh` executados com sucesso
- [ ] Rollback testado ao menos uma vez
- [ ] Backups rodando via cron e **validando** (linhas `OK` no log)
- [ ] Teste de restauração feito
- [ ] Cópia externa dos backups configurada
- [ ] Reboot real testado; tudo voltou sozinho
- [ ] Monitoramento externo (UptimeRobot ou similar) apontando para `/api/health`
- [ ] Lembretes no calendário: **semanal** (`saude.sh`) e **mensal** (Seção 20)

---

## 24. Resumo em uma página

**Implantação (uma vez):**
1. **PORTÃO 0** no repositório local: lockfiles versionados, `.env` fora do Git, rota `/api/health`, `trust proxy`.
2. VPS ≥2 GB, **Ubuntu 24.04 LTS**, chave SSH. Anotar o IP.
3. `needrestart` em `conf.d`; esperar o lock do apt; `apt upgrade`; reboot.
4. Hostname, fuso, swap idempotente, usuário `procar` — **PORTÃO 3: confirmar a chave antes de desativar a senha.**
5. SSH em `sshd_config.d/`; UFW com **números de porta** (não perfis).
6. Instalar tudo: base + `jq` + **Node 22 LTS** + MySQL + Nginx + PM2 + Certbot + Fail2Ban.
7. Fail2Ban com **só a jail `sshd`** (`backend = systemd` apenas nela) + `unattended-upgrades`.
8. MySQL: `sudo mysql` (não `-u root -p`), usuário `procar_app`, banco utf8mb4, tabelas de fuso.
9. DNS: **PORTÃO 8** — os dois nomes resolvendo.
10. Estrutura `releases/` + `shared/`.
11. **Deploy key no GitHub** completa: gerar → permissões → `~/.ssh/config` → `known_hosts` → cadastrar → **PORTÃO 10** (`ssh -T git@github.com`).
12. `.env` em `shared/`, `chmod 600`.
13. Backend: `npm ci --include=dev` → `build` → `db:setup` → `import:fipe:marcas` → `prune --omit=dev`. FIPE: **PORTÃO 12**.
14. Frontend: `npm ci --include=dev` → `build` → `rm -rf node_modules`.
15. Nginx: `conf.d` para limites, **snippet de segurança incluído em cada `location`**, proxy `/api`. Jails do Nginx no Fail2Ban.
16. **Não testar login ainda.** Certbot; validar `renew --dry-run` e o CSP no `index.html`.
17. PM2 pelo `ecosystem.config.js` (1 instância, fork) → `startup` → **PORTÃO 15** (`is-enabled`) → `save` → `logrotate`.
18. Validação funcional completa + reboot de teste + primeiro login.
19. Backups com **`--no-tablespaces`** e validação; cron; **PORTÃO 18**; teste de restauração.
20. Checklist da Seção 23.

**Operação:**
```bash
/var/www/procar/verificar.sh && /var/www/procar/deploy.sh
```

**Manutenção:**

| Quando | O quê |
|---|---|
| **Todo dia** | Automático: backups validados, correções de segurança, renovação do certificado. |
| **Toda semana** | `saude.sh` + olhada nos logs. 5 min. |
| **Todo mês** | `apt upgrade` + reboot se necessário, `npm audit`, disco, certificado, usuários, teste de restauração. 30-45 min. |
| **Todo trimestre** | Testar rollback, revisar pendências do `CLAUDE.md`, avaliar o plano da VPS. |
| **Todo ano** | Domínio, migração do Node, auditoria completa, revisão de acessos (inclusive deploy keys no GitHub). |

Seguido na ordem, com os portões respeitados, este guia leva de uma VPS recém-criada a um PROCAR em produção — com HTTPS, backups que comprovadamente funcionam, atualização em um comando, rollback em segundos e uma rotina de manutenção que qualquer pessoa consegue seguir.
