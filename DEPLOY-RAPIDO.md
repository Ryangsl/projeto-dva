# DEPLOY-RAPIDO.md — PROCAR em ~30 min

**VPS Hostinger · Ubuntu 24.04 LTS · só comandos.**
Versão enxuta do [DEPLOY.md](./DEPLOY.md) — mesmas correções da auditoria, sem as explicações. Use `nano` em vez dos heredocs se preferir editar à mão.

Substitua em todo o documento: `SEU_IP` · `seudominio.com.br` (só se for usar domínio — ver notas "sem domínio" nas seções 8/10/11/14 para acessar direto por IP) · `USUARIO/procar` · senhas.

⚠️ **Não pule os blocos marcados `PORTÃO`** — são os pontos onde um erro trava tudo mais adiante.

---

## 0 · Local, antes de começar (2 min)

```bash
# Na pasta do projeto, no SEU computador
git ls-files backend/package-lock.json frontend/package-lock.json   # devem aparecer os 2
git ls-files | grep -E "(^|/)\.env$"                                # deve vir VAZIO
grep -rn "trust proxy" backend/src/                                 # deve existir
grep -rn "'/health'" backend/src/routes/                            # deve existir (montada em /api por app.ts)
```

Faltando `trust proxy` → em `src/app.ts`, logo após `export const app = express();`:
```typescript
app.set('trust proxy', 1);
```

Faltando health → em `src/routes/index.ts`, antes das demais rotas:
```typescript
routes.get('/health', (_req, res) => res.json({ status: 'ok' }));
```
(a rota fica acessível em `/api/health` porque `app.ts` monta `app.use('/api', routes)` — o grep acima procura só o trecho `'/health'`, não a string completa)

```bash
# Sua chave SSH (se ainda não tiver)
ssh-keygen -t ed25519 -C "procar-vps"
cat ~/.ssh/id_ed25519.pub          # cole no hPanel: VPS → SSH Keys
```

---

## 1 · VPS (3 min)

hPanel → VPS → **Ubuntu 24.04 LTS** (sem painel), ≥2 GB RAM, data center mais próximo, **colar a chave SSH**. Anotar o IPv4.

hPanel → **VPS → Firewall**: liberar só **22, 80, 443**.

hPanel → **Domínios → Zona DNS**: registros `A` para `@` e `www` → IP da VPS. **Opcional para o primeiro deploy** — sem domínio ainda, acesse direto por `http://SEU_IP` (ver notas "sem domínio" nas seções 10/11/14) e volte aqui quando tiver um domínio registrado.

---

## 2 · Base do servidor (5 min)

```bash
ssh root@SEU_IP
```

```bash
# needrestart não-interativo (senão trava os apt)
mkdir -p /etc/needrestart/conf.d
echo "\$nrconf{restart} = 'a';" > /etc/needrestart/conf.d/99-procar.conf

# espera o unattended-upgrades do primeiro boot soltar o lock
while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do sleep 5; done

apt update && apt upgrade -y && apt autoremove -y

hostnamectl set-hostname procar-vps
grep -q "127.0.1.1" /etc/hosts || echo "127.0.1.1   procar-vps" >> /etc/hosts
timedatectl set-timezone America/Sao_Paulo

# swap (idempotente)
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
sysctl -p >/dev/null

# usuário
adduser --gecos "" procar
usermod -aG sudo procar
rsync --archive --chown=procar:procar ~/.ssh /home/procar 2>/dev/null || true
```

### ⚠️ PORTÃO A — chave do `procar` (sem isso você se tranca para fora)

```bash
sudo test -s /home/procar/.ssh/authorized_keys && echo "OK" || echo "PARE"
```

Se **PARE**, do seu computador: `ssh-copy-id procar@SEU_IP`
Ou, no servidor:
```bash
mkdir -p /home/procar/.ssh
echo "COLE_AQUI_SUA_CHAVE_PUBLICA" > /home/procar/.ssh/authorized_keys
chown -R procar:procar /home/procar/.ssh
chmod 700 /home/procar/.ssh && chmod 600 /home/procar/.ssh/authorized_keys
```

**Teste em janela nova:** `ssh procar@SEU_IP` → deve entrar sem senha. Só então siga.

---

## 3 · SSH + firewall (2 min)

```bash
sudo tee /etc/ssh/sshd_config.d/99-procar.conf > /dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
AllowAgentForwarding no
EOF

sudo sshd -t && sudo systemctl restart ssh

# portas por NÚMERO (o perfil "Nginx Full" ainda não existe)
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw --force enable && sudo ufw status
```

---

## 4 · Pacotes (4 min)

```bash
sudo apt install -y build-essential git curl unzip htop ncdu rsync jq ca-certificates gnupg \
                    mysql-server nginx certbot python3-certbot-nginx fail2ban

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

node -v && npm -v && npm config get omit    # omit deve vir vazio/[]
```

---

## 5 · Fail2Ban + auto-updates (1 min)

```bash
sudo tee /etc/fail2ban/jail.local > /dev/null <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
bantime.increment = true
bantime.maxtime   = 1w
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
backend = systemd

[nginx-http-auth]
enabled = true
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
logpath = /var/log/nginx/error.log
EOF

sudo systemctl enable --now fail2ban
sudo fail2ban-client status          # 3 jails

sudo apt install -y unattended-upgrades
systemctl is-enabled unattended-upgrades
```

---

## 6 · MySQL (3 min)

```bash
sudo mysql_secure_installation
# n / y+senha / y / y / y / y
```

```bash
sudo mysql <<'EOF'
CREATE USER IF NOT EXISTS 'procar_app'@'localhost' IDENTIFIED BY 'TROQUE_ESTA_SENHA';
CREATE DATABASE IF NOT EXISTS painel_procar CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON painel_procar.* TO 'procar_app'@'localhost';
FLUSH PRIVILEGES;
EOF

sudo mysql_tzinfo_to_sql /usr/share/zoneinfo | sudo mysql mysql 2>/dev/null

echo "innodb_buffer_pool_size = 256M" | sudo tee -a /etc/mysql/mysql.conf.d/mysqld.cnf
sudo systemctl restart mysql
```

### ⚠️ PORTÃO B
```bash
mysql -u procar_app -p painel_procar -e "SELECT 'ok';"
```

---

## 7 · Chave de deploy do GitHub (3 min)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/deploy_procar -C "deploy-procar-vps" -N ""
chmod 700 ~/.ssh && chmod 600 ~/.ssh/deploy_procar

cat >> ~/.ssh/config <<'EOF'

Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/deploy_procar
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null

cat ~/.ssh/deploy_procar.pub
```

Copie a saída → GitHub → repositório → **Settings → Deploy keys → Add deploy key** → cole → **NÃO** marcar *Allow write access* → Add.

### ⚠️ PORTÃO C
```bash
ssh -T git@github.com
```
Esperado: `Hi USUARIO/procar! You've successfully authenticated...` (não é erro).

---

## 8 · Pastas + `.env` (2 min)

```bash
sudo mkdir -p /var/www/procar/{releases,shared/backend,shared/frontend,shared/logs}
sudo chown -R procar:procar /var/www/procar

JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")

cat > /var/www/procar/shared/backend/.env <<EOF
PORT=3333
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_USER=procar_app
DB_PASSWORD=TROQUE_ESTA_SENHA
DB_NAME=painel_procar
JWT_SECRET=$JWT
JWT_EXPIRES_IN=30m
ADMIN_SENHA_INICIAL=TROQUE_SENHA_ADMIN
CORS_ORIGIN=http://SEU_IP
# Sem domínio/HTTPS ainda (só IP): cookie Secure é descartado pelo navegador em
# http://. Deixe false enquanto não houver domínio + certbot (seção 11); depois
# REMOVA esta linha (produção volta ao padrão Secure=true) e troque CORS_ORIGIN
# para https://seudominio.com.br — ver seção "11b".
COOKIE_SECURE=false
FIPE_API_KEY=
EOF

echo "VITE_API_URL=/api" > /var/www/procar/shared/frontend/.env
chmod 600 /var/www/procar/shared/backend/.env

cat > /var/www/procar/shared/.my.cnf <<'EOF'
[client]
user=procar_app
password=TROQUE_ESTA_SENHA
EOF
chmod 600 /var/www/procar/shared/.my.cnf
```

> Se você já tem domínio pronto agora (não é o seu caso hoje), use `CORS_ORIGIN=https://seudominio.com.br`, **não** defina `COOKIE_SECURE` (fica `true` por padrão em produção) e siga a seção 11 (HTTPS) normalmente.

---

## 9 · Build e deploy (6 min)

```bash
whoami                                  # tem que ser: procar
TIMESTAMP=$(date +%Y%m%d%H%M%S)
git clone git@github.com:Ryangsl/painel-procar.git /var/www/procar/releases/$TIMESTAMP
cd /var/www/procar/releases/$TIMESTAMP

ln -sf /var/www/procar/shared/backend/.env  backend/.env
ln -sf /var/www/procar/shared/frontend/.env frontend/.env

# BACKEND — ordem obrigatória: tudo → build → setup → poda
cd backend
npm ci --include=dev
npm run build
npm run db:setup
```

**Veículos FIPE** (sem isso o wizard fica sem carros) — uma das duas:
```bash
# A) restaurar dump do seu banco local (scp veiculos.sql procar@SEU_IP:/var/www/procar/shared/)
mysql -u procar_app -p painel_procar < /var/www/procar/shared/veiculos.sql

# B) importar da API (preencha FIPE_API_KEY no .env antes)
npm run import:fipe:marcas
```

### ⚠️ PORTÃO D
```bash
mysql -u procar_app -p painel_procar -e "SELECT COUNT(*) FROM vehicle_brands; SELECT COUNT(*) FROM vehicle_models;"
```
Zero = não adianta seguir.

```bash
npm prune --omit=dev

# FRONTEND
cd ../frontend
npm ci --include=dev
npm run build
rm -rf node_modules
```

⚠️ **Não use `$TIMESTAMP` aqui** — se essa variável sumir da sessão (reconectou o SSH, colou só esse trecho isolado...), ela expande para vazio e o `ln` aponta `current` para a pasta `releases/` inteira, não para o release, quebrando o site inteiro (Nginx: "`.../current/frontend/dist/index.html` No such file or directory") sem erro nenhum na hora. O comando abaixo deriva o caminho do release da pasta atual, então funciona mesmo que `$TIMESTAMP` tenha sumido, e só troca o symlink se o build realmente existir:

```bash
RELEASE_DIR=$(dirname "$(pwd)")   # você está em .../releases/TIMESTAMP/frontend
[ -f "$RELEASE_DIR/frontend/dist/index.html" ] || { echo "✖ dist/index.html não existe em $RELEASE_DIR — build falhou, não avance."; exit 1; }
[ -f "$RELEASE_DIR/backend/dist/server.js" ]   || { echo "✖ backend/dist/server.js não existe em $RELEASE_DIR — build falhou, não avance."; exit 1; }

ln -sfn "$RELEASE_DIR" /var/www/procar/current
readlink -f /var/www/procar/current               # confirme: tem que ser o caminho do release, NÃO .../releases sozinho
```

---

## 10 · Nginx (3 min)

`sudo tee` **sobrescreve o arquivo inteiro** a cada execução (não é `>>`, não acrescenta) — rodar qualquer um destes blocos de novo (agora, ou quando migrar para domínio na seção 11b) é seguro e substitui limpo o conteúdo anterior, sem duplicar nada. `ln -sfn` idem para o symlink.

### Sem domínio (seu caso agora) — acesso só por `http://SEU_IP`

```bash
sudo tee /etc/nginx/conf.d/procar-limits.conf > /dev/null <<'EOF'
limit_req_zone $binary_remote_addr zone=procar_api:10m rate=10r/s;
EOF

sudo tee /etc/nginx/snippets/procar-security.conf > /dev/null <<'EOF'
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
EOF

sudo tee /etc/nginx/sites-available/procar > /dev/null <<'EOF'
server {
    listen 80 default_server;
    server_name _;
    root /var/www/procar/current/frontend/dist;
    index index.html;

    include /etc/nginx/snippets/procar-security.conf;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/css text/plain application/javascript application/json image/svg+xml;

    location ~* \.(js|css|svg|png|jpg|jpeg|webp|woff2?)$ {
        include /etc/nginx/snippets/procar-security.conf;
        expires 30d;
        add_header Cache-Control "public, immutable" always;
        access_log off;
    }

    location = /index.html {
        include /etc/nginx/snippets/procar-security.conf;
        add_header Cache-Control "no-cache" always;
    }

    location / { try_files $uri $uri/ /index.html; }

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
EOF

sudo ln -sfn /etc/nginx/sites-available/procar /etc/nginx/sites-enabled/procar
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

`server_name _;` + `default_server` = "responde por qualquer Host/IP que bater nessa porta 80" — não precisa digitar o IP no arquivo (ele pode até mudar, se um dia você trocar de VPS, sem precisar editar o Nginx). Não existe `sed` de domínio a rodar aqui — não há domínio ainda.

### Com domínio já registrado (pule esta se está sem domínio)

```bash
sudo tee /etc/nginx/conf.d/procar-limits.conf > /dev/null <<'EOF'
limit_req_zone $binary_remote_addr zone=procar_api:10m rate=10r/s;
EOF

sudo tee /etc/nginx/snippets/procar-security.conf > /dev/null <<'EOF'
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
EOF

sudo tee /etc/nginx/sites-available/procar > /dev/null <<'EOF'
server {
    listen 80;
    server_name seudominio.com.br www.seudominio.com.br;
    root /var/www/procar/current/frontend/dist;
    index index.html;

    include /etc/nginx/snippets/procar-security.conf;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/css text/plain application/javascript application/json image/svg+xml;

    location ~* \.(js|css|svg|png|jpg|jpeg|webp|woff2?)$ {
        include /etc/nginx/snippets/procar-security.conf;
        expires 30d;
        add_header Cache-Control "public, immutable" always;
        access_log off;
    }

    location = /index.html {
        include /etc/nginx/snippets/procar-security.conf;
        add_header Cache-Control "no-cache" always;
    }

    location / { try_files $uri $uri/ /index.html; }

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
EOF

sudo sed -i 's/seudominio\.com\.br/SEUDOMINIO_REAL/g' /etc/nginx/sites-available/procar
sudo ln -sfn /etc/nginx/sites-available/procar /etc/nginx/sites-enabled/procar
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

⚠️ **Com domínio (vai fazer HTTPS a seguir):** não teste o login ainda — cookie `Secure` não funciona em `http://`, espere a seção 11.
**Sem domínio (`COOKIE_SECURE=false` já setado na seção 8):** pode testar o login normalmente por `http://SEU_IP` assim que o PM2 (seção 12) estiver de pé.

---

## 11 · HTTPS (2 min)

> ⏭️ **Sem domínio ainda: pule esta seção inteira** e vá direto para a 12 (PM2). O Certbot/Let's Encrypt não emite certificado para IP puro — só para um domínio que resolva por DNS. Você já deixou o `.env` preparado para isso (`COOKIE_SECURE=false`, `CORS_ORIGIN=http://SEU_IP`) na seção 8. Volte aqui quando tiver um domínio (ver seção 11b).

```bash
# PORTÃO E: os dois nomes precisam resolver
for h in seudominio.com.br www.seudominio.com.br; do echo -n "$h -> "; getent hosts $h | awk '{print $1}' | head -1; done

sudo certbot --nginx -d seudominio.com.br -d www.seudominio.com.br
sudo certbot renew --dry-run
```

---

## 11b · Migrando de IP para domínio (fazer depois, quando tiver um)

Quando registrar o domínio e apontar o DNS (seção 1):

```bash
# 1. DNS resolvendo? (repita até aparecer o IP da VPS)
for h in seudominio.com.br www.seudominio.com.br; do echo -n "$h -> "; getent hosts $h | awk '{print $1}' | head -1; done

# 2. Nginx: rode de novo o bloco "Com domínio já registrado" da seção 10
#    (o `tee` sobrescreve o arquivo inteiro — troca limpa, sem sed, sem duplicar)
sudo nginx -t && sudo systemctl reload nginx

# 3. Certbot (gera o certificado e já reescreve o server block para HTTPS + redirect)
sudo certbot --nginx -d seudominio.com.br -d www.seudominio.com.br
sudo certbot renew --dry-run

# 4. .env: volta para HTTPS e remove o COOKIE_SECURE=false (rode como procar)
sed -i '/^COOKIE_SECURE=/d' /var/www/procar/shared/backend/.env
sed -i 's#^CORS_ORIGIN=.*#CORS_ORIGIN=https://seudominio.com.br#' /var/www/procar/shared/backend/.env

# 5. Reinicia a API com o .env novo
pm2 restart procar-api --update-env
```

⚠️ Depois do passo 4, o cookie de auth volta a ser `Secure` — teste o login **só por `https://`**; por `http://` vai parecer que "não funciona" (é o comportamento esperado, o navegador descarta o cookie).

---

## 12 · PM2 (2 min)

⚠️ Nunca `sudo pm2` — cria um segundo daemon.

```bash
cat > /var/www/procar/shared/ecosystem.config.js <<'EOF'
module.exports = {
  apps: [{
    name: 'procar-api',
    script: 'dist/server.js',
    cwd: '/var/www/procar/current/backend',
    instances: 1,          // NUNCA cluster: rate limit e job de retenção em memória
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '300M',
    kill_timeout: 5000,
    env: { NODE_ENV: 'production' },
    error_file: '/var/www/procar/shared/logs/error.log',
    out_file:   '/var/www/procar/shared/logs/out.log',
    time: true,
  }],
};
EOF

pm2 start /var/www/procar/shared/ecosystem.config.js
pm2 startup
```

⚠️ **Pare aqui — não cole o resto do bloco ainda.** `pm2 startup` só **imprime** um comando, não executa nada sozinho (é proposital: instalar um serviço systemd exige confirmação explícita). Se você colar tudo de uma vez, o shell pula direto para `pm2 save` sem nunca rodar essa linha, e o serviço nunca é criado (é exatamente o que dá `not-found` no PORTÃO F).

Copie **a linha que apareceu no seu terminal** (algo como `[PM2] To setup the Startup Script, copy/paste the following command:` seguido da linha) e rode-a sozinha:

```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u procar --hp /home/procar
```

Só **depois** disso, continue com o resto:

```bash
pm2 save
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

### ⚠️ PORTÃO F
```bash
systemctl is-enabled pm2-procar        # tem que ser: enabled
```

Deu `not-found`? Rode a linha `sudo env PATH=...` acima (a que o `pm2 startup` imprimiu) e depois `pm2 save` de novo — não precisa refazer o resto do bloco.

---

## 13 · Scripts de deploy e backup (3 min)

```bash
cat > /var/www/procar/shared/backup-db.sh <<'EOF'
#!/bin/bash
set -euo pipefail
DEST=/var/backups/procar; mkdir -p "$DEST"
ARQ="$DEST/db-$(date +%Y-%m-%d_%H%M).sql.gz"
mysqldump --defaults-extra-file=/var/www/procar/shared/.my.cnf \
  --single-transaction --quick --no-tablespaces --routines --triggers --events \
  painel_procar | gzip > "$ARQ"
gzip -t "$ARQ" || { echo "ERRO: corrompido"; exit 1; }
gunzip -c "$ARQ" | tail -5 | grep -q "Dump completed" || { echo "ERRO: incompleto"; exit 1; }
echo "$(date '+%F %T') OK $ARQ ($(du -h "$ARQ" | cut -f1))"
find "$DEST" -name "db-*.sql.gz" -mtime +14 -delete
EOF

cat > /var/www/procar/shared/backup-files.sh <<'EOF'
#!/bin/bash
set -euo pipefail
DEST=/var/backups/procar; mkdir -p "$DEST"
ARQ="$DEST/config-$(date +%Y-%m-%d_%H%M).tar.gz"
tar -czf "$ARQ" /var/www/procar/shared/backend/.env /var/www/procar/shared/frontend/.env \
  /var/www/procar/shared/ecosystem.config.js /etc/nginx/sites-available/procar \
  /etc/nginx/snippets/procar-security.conf /etc/nginx/conf.d/procar-limits.conf \
  /etc/fail2ban/jail.local 2>/dev/null || true
echo "$(date '+%F %T') OK $ARQ"
find "$DEST" -name "config-*.tar.gz" -mtime +14 -delete
EOF

sudo mkdir -p /var/backups/procar && sudo chown procar:procar /var/backups/procar
chmod +x /var/www/procar/shared/backup-*.sh
/var/www/procar/shared/backup-db.sh          # PORTÃO G: precisa imprimir OK
/var/www/procar/shared/backup-files.sh
```

⚠️ **`REPO_URL` abaixo tem que ser o MESMO repositório usado no `git clone` da seção 9** (ex.: `git@github.com:Ryangsl/painel-procar.git`), não o placeholder `USUARIO/procar` — é fácil esquecer de trocar dentro do heredoc. Se esquecer, o primeiro `procar update`/`deploy.sh` falha com `ERROR: Repository not found` (inofensivo — o script já reverte sozinho antes de tocar no `current`, o site no ar não é afetado); corrija com `sed -i 's#^REPO_URL=.*#REPO_URL="git@github.com:SEU_USUARIO/SEU_REPO.git"#' /var/www/procar/deploy.sh` e rode de novo.

```bash
cat > /var/www/procar/deploy.sh <<'EOF'
#!/bin/bash
set -euo pipefail
APP_DIR=/var/www/procar
REPO_URL="git@github.com:USUARIO/procar.git"
TS=$(date +%Y%m%d%H%M%S)
REL="$APP_DIR/releases/$TS"

trap '[ -d "$REL" ] && [ "$(readlink -f "$APP_DIR/current" || true)" != "$REL" ] && rm -rf "$REL"' ERR

"$APP_DIR/shared/backup-db.sh"
git clone --depth 1 "$REPO_URL" "$REL"
ln -sf "$APP_DIR/shared/backend/.env"  "$REL/backend/.env"
ln -sf "$APP_DIR/shared/frontend/.env" "$REL/frontend/.env"

cd "$REL/backend" && npm ci --include=dev && npm run build && npm run db:setup && npm prune --omit=dev
cd "$REL/frontend" && npm ci --include=dev && npm run build && rm -rf node_modules

ANTERIOR=""; [ -L "$APP_DIR/current" ] && ANTERIOR=$(readlink -f "$APP_DIR/current")
ln -sfn "$REL" "$APP_DIR/current"
pm2 describe procar-api >/dev/null 2>&1 && pm2 restart procar-api --update-env \
  || pm2 start "$APP_DIR/shared/ecosystem.config.js"

OK=0
for i in $(seq 1 15); do
  curl -sf --max-time 2 http://127.0.0.1:3333/api/health >/dev/null 2>&1 && { OK=1; break; }
  sleep 2
done

if [ "$OK" -eq 1 ]; then
  echo "✅ Deploy OK: $TS"
  cd "$APP_DIR/releases" && ls -1t | tail -n +6 | while read -r a; do
    [ "$(readlink -f "$APP_DIR/current")" != "$APP_DIR/releases/$a" ] && rm -rf "$a"
  done
else
  echo "❌ Falhou. Revertendo."
  [ -n "$ANTERIOR" ] && ln -sfn "$ANTERIOR" "$APP_DIR/current" && pm2 restart procar-api --update-env
  echo "pm2 logs procar-api --lines 50 --nostream"
  exit 1
fi
EOF
chmod +x /var/www/procar/deploy.sh
```

```bash
(crontab -l 2>/dev/null; cat <<'EOF'
0 3 * * * /var/www/procar/shared/backup-db.sh >> /var/www/procar/shared/logs/backup.log 2>&1
5 3 * * * /var/www/procar/shared/backup-files.sh >> /var/www/procar/shared/logs/backup.log 2>&1
EOF
) | crontab -
crontab -l
```

> Backup só na VPS não protege contra perder a VPS. Ative **hPanel → VPS → Backups**, ou acrescente `15 3 * * * rsync -az /var/backups/procar/ usuario@outra-maquina:/backups/procar/`.

---

## 14 · Validação final (2 min)

**Sem domínio (seu caso agora)** — use `http://SEU_IP` em vez de `https://seudominio.com.br`, e pule o teste de redirect 301 (não existe redirect HTTP→HTTPS sem Certbot):
```bash
curl -s http://179.198.102.204/api/health                                              # {"status":"ok"...}
curl -sI http://179.198.102.204/index.html | grep -ci "content-security"               # 1
pm2 status                                                                     # online, fork, 1
sudo fail2ban-client status                                                    # 3 jails
sudo reboot
```

Após o reboot:
```bash
pm2 status && systemctl is-active nginx mysql fail2ban
curl -s -o /dev/null -w "%{http_code}\n" http://179.198.102.204                        # 200
```

**Com domínio + HTTPS já configurados** (seção 11 feita):
```bash
curl -s https://seudominio.com.br/api/health                                  # {"status":"ok"...}
curl -sI http://seudominio.com.br | head -1                                   # 301
curl -sI https://seudominio.com.br/index.html | grep -ci "content-security"   # 1
pm2 status                                                                     # online, fork, 1
sudo fail2ban-client status                                                    # 3 jails
sudo reboot
```

Após o reboot:
```bash
pm2 status && systemctl is-active nginx mysql fail2ban
curl -s -o /dev/null -w "%{http_code}\n" https://seudominio.com.br            # 200
```

**No navegador:** entrar com `admin@procar.com` + `ADMIN_SENHA_INICIAL` → trocar a senha → criar um consultor em `/usuarios` → rodar o wizard completo → gerar PDF → desligar o wi-fi e conferir que o guia continua funcionando.

---

## 15 · Atalho `procar` (2 min, opcional mas recomendado)

Em vez de lembrar caminhos (`/var/www/procar/deploy.sh`, `ls releases`, `ln -sfn`...), instala um comando único com subcomandos. Roda **uma vez**, como `procar` (nunca `sudo`):

```bash
sudo tee /usr/local/bin/procar > /dev/null <<'EOF'
#!/bin/bash
set -euo pipefail
APP_DIR=/var/www/procar

if [ "$(id -u)" -eq 0 ]; then
  echo "Não rode 'procar' com sudo/root — rode como o usuário procar." >&2
  exit 1
fi

case "${1:-}" in
  update)
    exec "$APP_DIR/deploy.sh"
    ;;
  status)
    pm2 status
    echo
    df -h /
    free -h
    ;;
  logs)
    pm2 logs procar-api --lines "${2:-50}" --nostream
    ;;
  rollback)
    CUR=$(readlink -f "$APP_DIR/current")
    PREV=$(ls -1t "$APP_DIR/releases" | grep -vF "$(basename "$CUR")" | head -1)
    if [ -z "$PREV" ]; then
      echo "Não achei um release anterior para reverter."
      exit 1
    fi
    echo "Release atual:      $(basename "$CUR")"
    echo "Vai reverter para:   $PREV"
    read -r -p "Confirma? [s/N] " resp
    case "$resp" in
      s|S) ;;
      *) echo "Cancelado."; exit 1 ;;
    esac
    ln -sfn "$APP_DIR/releases/$PREV" "$APP_DIR/current"
    pm2 restart procar-api --update-env
    echo "✔ Revertido para $PREV"
    ;;
  backup)
    "$APP_DIR/shared/backup-db.sh"
    "$APP_DIR/shared/backup-files.sh"
    ;;
  *)
    echo "Uso: procar {update|status|logs [N]|rollback|backup}"
    exit 1
    ;;
esac
EOF
sudo chmod +x /usr/local/bin/procar

procar status          # testa agora
```

| Comando | O que faz |
|---|---|
| `procar update` | Roda o `deploy.sh` completo: backup do banco → clone de um release novo → build → `db:setup` → troca o `current` → reinicia o PM2 → checa `/api/health` → **reverte sozinho se falhar**. É o único jeito de atualizar o código — nunca `git pull` manual (ver seção "Uso diário"). |
| `procar status` | `pm2 status` + espaço em disco + memória — checagem rápida de saúde. |
| `procar logs [N]` | Últimas N linhas do log da API (padrão 50). |
| `procar rollback` | Mostra o release atual e o anterior, pede confirmação (`s`/`N`) e só então troca o symlink e reinicia — nunca reverte sem você confirmar. |
| `procar backup` | Roda os dois scripts de backup na hora (fora do horário do cron), útil antes de uma mudança arriscada. |

---

## Uso diário

**Onde fica o projeto:** o código "vivo" é o symlink `/var/www/procar/current` → `releases/TIMESTAMP/`. Cada deploy clona um release **novo** (`git clone --depth 1`), nunca dá `git pull` dentro do release existente — se você `git pull` manualmente em `current/backend`, o próximo `deploy.sh` (ou `procar update`) clona do zero, troca o symlink e a poda automática (mantém os 5 releases mais recentes) acaba apagando o que você mexeu à mão. `.env`, `ecosystem.config.js` e `logs/` ficam fora disso, em `shared/` (sobrevivem a todos os deploys).

```bash
procar update                                    # atualizar (SEMPRE por aqui, nunca git pull manual)
procar rollback                                  # reverter para o release anterior (pede confirmação)
procar status                                    # pm2 + disco + memória
procar logs                                      # últimas 50 linhas do log da API
```

Sem o atalho instalado (seção 15), os mesmos comandos por extenso:
```bash
/var/www/procar/deploy.sh                       # atualizar

ls -1t /var/www/procar/releases                 # rollback manual
ln -sfn /var/www/procar/releases/ANTERIOR /var/www/procar/current
pm2 restart procar-api --update-env

pm2 logs procar-api --lines 50 --nostream       # ver erros
pm2 status; df -h; free -h                      # saúde rápida
```

**Backups:** rodam sozinhos via cron (seção 13) — `backup-db.sh` às 03:00 (dump do MySQL) e `backup-files.sh` às 03:05 (`.env`/Nginx/Fail2Ban), ambos em `/var/backups/procar/`, retendo 14 dias. Isso só protege contra erro de deploy/dado corrompido — **não** protege contra perder a VPS inteira (backup e app na mesma máquina); ative também o backup do hPanel ou copie `/var/backups/procar/` pra outro lugar.

**Manutenção mínima:** semanal → `pm2 status` + `df -h` + conferir se o backup de ontem existe. Mensal → `sudo apt upgrade -y`, reboot se `/var/run/reboot-required` existir, `npm audit --omit=dev`, testar uma restauração de backup.

Detalhes, explicações e rotinas completas: **[DEPLOY.md](./DEPLOY.md)** · problemas conhecidos: **[AUDITORIA-DEPLOY.md](./AUDITORIA-DEPLOY.md)**.

---

## Se algo der errado

| Sintoma | Comando |
|---|---|
| Site não abre | `sudo nginx -t; sudo tail -30 /var/log/nginx/error.log` |
| API dá 502 | `pm2 logs procar-api --lines 50 --nostream; pgrep -a -f "PM2\["` |
| Login não persiste | Em `https://`: cookie é `Secure` como esperado. Em `http://SEU_IP` (sem domínio): falta `COOKIE_SECURE=false` no `.env` — confira e `pm2 restart procar-api --update-env`. |
| Todos bloqueados | Falta `app.set('trust proxy', 1)` |
| Backup falhando | Falta `--no-tablespaces` (erro de privilégio PROCESS) |
| Backend não voltou após reboot | `systemctl is-enabled pm2-procar` → rodar `pm2 startup` |
| Trancado fora do SSH | Terminal do navegador no hPanel; `sudo fail2ban-client set sshd unbanip SEU_IP` |
