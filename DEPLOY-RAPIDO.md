# DEPLOY-RAPIDO.md — Grupo ProCar (procar-dva) na mesma VPS do PROCAR antigo

**VPS Hostinger já em produção · domínio `procarservice.com.br` · só comandos.**

Esta VPS já hospeda o sistema antigo (**"Guia de Atendimento" PROCAR**, repositório `painel-procar`), em `https://guia.procarservice.com.br`, implantado seguindo o `DEPLOY-RAPIDO.md` original daquele projeto. Este guia **não repete o provisionamento da VPS** (já feito) — ele soma o Grupo ProCar (`procar-dva`) ao lado, em `https://dva.procarservice.com.br`, sem tocar em nada do sistema antigo.

> Assumindo o subdomínio **`dva.procarservice.com.br`** para este sistema, seguindo o mesmo padrão do identificador técnico interno do projeto (banco `dva_veiculos`, pacotes `dva-veiculos-*` — ver `CLAUDE.md` §5). Se preferir outro nome (ex. `veiculos.procarservice.com.br`), troque só isso em todo o documento — nada mais depende do nome escolhido.

Substitua neste documento: `SEU_IP` (mesmo IP da VPS já em uso) · `TROQUE_ESTA_SENHA_DVA` · `TROQUE_SENHA_ADMIN_DVA`.

⚠️ **Não pule os blocos marcados `PORTÃO`.**

---

## 0 · O que já existe na VPS e NÃO é repetido aqui

Feito pelo deploy do sistema antigo, reaproveitado sem alteração:

- VPS Ubuntu, hostname, swap, timezone, usuário `procar` (com sudo), SSH endurecido (só chave), UFW (`22/80/443` liberadas).
- Pacotes: `nginx`, `mysql-server`, `certbot`, `node` (22.x), `pm2` (daemon já rodando sob o usuário `procar`, com `pm2 startup` configurado), `fail2ban`.
- Instância MySQL única (`mysql-server`) já de pé, com o banco `painel_procar` e o usuário `procar_app`.
- `procar-api` (backend antigo) já escutando em `127.0.0.1:3333`, publicado via Nginx em `https://guia.procarservice.com.br`.

**Nada disso é reinstalado ou reiniciado neste guia** — só entram peças novas, todas com nome/porta/caminho diferentes do que o sistema antigo já usa.

---

## Tabela de não-colisão

| Item | Sistema antigo (guia) | Grupo ProCar — `procar-dva` (este guia) |
|---|---|---|
| Domínio | `guia.procarservice.com.br` | `dva.procarservice.com.br` |
| Diretório | `/var/www/procar` | `/var/www/dva-veiculos` |
| Porta do backend | `3333` | `3334` |
| Banco próprio | `painel_procar` | `dva_veiculos` (novo) + leitura cross-database em `painel_procar` (catálogo FIPE, ver `CLAUDE.md` §5) |
| Usuário MySQL | `procar_app` | `dva_app` (novo — `ALL` em `dva_veiculos`, `SELECT` em `painel_procar`) |
| Processo PM2 | `procar-api` | `dva-veiculos-api` (mesmo daemon PM2, mesmo usuário `procar` — não precisa de novo `pm2 startup`) |
| Site Nginx | `/etc/nginx/sites-available/procar` | `/etc/nginx/sites-available/dva-veiculos` |
| Zona de rate limit Nginx | `procar_api` | `dva_api` (nomes de zona são globais no Nginx — não pode reaproveitar o mesmo) |
| Repositório GitHub | `Ryangsl/painel-procar` | `Ryangsl/procar-dva` |
| Chave de deploy | `~/.ssh/deploy_procar` (alias SSH `github.com`) | `~/.ssh/deploy_dva` (alias SSH `github.com-dva` — precisa de alias próprio, senão o SSH tenta a chave errada primeiro) |
| Script de deploy | `/var/www/procar/deploy.sh` | `/var/www/dva-veiculos/deploy.sh` |
| Comando CLI | `procar` | `dva-veiculos` |
| Backups | `/var/backups/procar` | `/var/backups/dva-veiculos` |

O snippet de headers de segurança (`/etc/nginx/snippets/procar-security.conf`) **é reaproveitado** (conteúdo genérico, sem nada específico do sistema antigo) — só a zona de rate limit precisa ser nova.

---

## 1 · DNS (1 min)

hPanel → **Domínios → Zona DNS de `procarservice.com.br`** → novo registro `A`:

```
dva    A    SEU_IP
```

### ⚠️ PORTÃO A — DNS precisa resolver antes de seguir
```bash
getent hosts dva.procarservice.com.br | awk '{print $1}'   # tem que devolver SEU_IP
```
Propagação pode levar alguns minutos. Só avance quando resolver.

---

## 2 · Banco de dados novo + usuário (2 min)

```bash
ssh procar@SEU_IP
```

```bash
sudo mysql <<'EOF'
CREATE USER IF NOT EXISTS 'dva_app'@'localhost' IDENTIFIED BY 'TROQUE_ESTA_SENHA_DVA';
CREATE DATABASE IF NOT EXISTS dva_veiculos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON dva_veiculos.* TO 'dva_app'@'localhost';
-- Leitura do catálogo de marca/modelo já importado da FIPE no banco antigo
-- (cross-database, mesma instância — CLAUDE.md §5/§6). Só SELECT: o DVA nunca
-- escreve no banco antigo.
GRANT SELECT ON painel_procar.* TO 'dva_app'@'localhost';
FLUSH PRIVILEGES;
EOF
```

### ⚠️ PORTÃO B
```bash
mysql -u dva_app -p dva_veiculos -e "SELECT 'ok';"
mysql -u dva_app -p -e "SELECT COUNT(*) FROM painel_procar.vehicle_brands;"   # não pode dar 'access denied'
```

---

## 3 · Chave de deploy do GitHub — repositório separado (3 min)

A chave `deploy_procar` já cadastrada só tem permissão no repositório antigo. Precisa de uma chave **nova**, e como os dois repositórios vivem em `github.com`, um **alias** no `~/.ssh/config` evita que o SSH escolha a chave errada:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/deploy_dva -C "deploy-procar-dva-vps" -N ""
chmod 600 ~/.ssh/deploy_dva

cat >> ~/.ssh/config <<'EOF'

Host github.com-dva
    HostName github.com
    User git
    IdentityFile ~/.ssh/deploy_dva
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

cat ~/.ssh/deploy_dva.pub
```

Copie a saída → GitHub → repositório `procar-dva` → **Settings → Deploy keys → Add deploy key** → cole → **NÃO** marcar *Allow write access* → Add.

### ⚠️ PORTÃO C
```bash
ssh -T git@github.com-dva
```
Esperado: `Hi Ryangsl/procar-dva! You've successfully authenticated...`

---

## 4 · Pastas + `.env` (2 min)

```bash
sudo mkdir -p /var/www/dva-veiculos/{releases,shared/backend,shared/frontend,shared/logs}
sudo chown -R procar:procar /var/www/dva-veiculos

JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")

cat > /var/www/dva-veiculos/shared/backend/.env <<EOF
PORT=3334
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_USER=dva_app
DB_PASSWORD=TROQUE_ESTA_SENHA_DVA
DB_NAME=dva_veiculos
DB_VEHICLES_NAME=painel_procar
JWT_SECRET=$JWT
JWT_EXPIRES_IN=30m
ADMIN_SENHA_INICIAL=TROQUE_SENHA_ADMIN_DVA
CORS_ORIGIN=https://dva.procarservice.com.br
FIPE_API_KEY=
EOF

echo "VITE_API_URL=/api" > /var/www/dva-veiculos/shared/frontend/.env
chmod 600 /var/www/dva-veiculos/shared/backend/.env

cat > /var/www/dva-veiculos/shared/.my.cnf <<'EOF'
[client]
user=dva_app
password=TROQUE_ESTA_SENHA_DVA
EOF
chmod 600 /var/www/dva-veiculos/shared/.my.cnf
```

Domínio próprio desde já em produção → **não** defina `COOKIE_SECURE` (fica `true` por padrão, correto com HTTPS). Isso só seria necessário num deploy sem domínio ainda — não é o caso aqui.

---

## 5 · Build e primeiro release (6 min)

```bash
whoami                                  # tem que ser: procar
TIMESTAMP=$(date +%Y%m%d%H%M%S)
git clone github.com-dva:Ryangsl/procar-dva.git /var/www/dva-veiculos/releases/$TIMESTAMP
cd /var/www/dva-veiculos/releases/$TIMESTAMP

ln -sf /var/www/dva-veiculos/shared/backend/.env  backend/.env
ln -sf /var/www/dva-veiculos/shared/frontend/.env frontend/.env

# BACKEND — ordem obrigatória: tudo → build → setup → poda
cd backend
npm ci --include=dev
npm run build
npm run db:setup
```

### ⚠️ PORTÃO D — catálogo de marca/modelo (cross-database)
```bash
mysql -u dva_app -p -e "SELECT COUNT(*) FROM painel_procar.vehicle_brands WHERE name LIKE '%Mercedes%' OR name LIKE '%Jeep%' OR name LIKE '%RAM%' OR name LIKE '%BYD%' OR name LIKE '%Dodge%' OR name LIKE '%Chrysler%' OR name LIKE '%Denza%';"
```
Zero = o wizard de cadastro fica sem marcas. O catálogo é o mesmo já importado pelo sistema antigo (`vehicle_brands`/`vehicle_models` em `painel_procar`) — se a contagem vier zero, confira se o import da FIPE (`npm run import:fipe:marcas`, rodado pelo projeto antigo) já cobre as 7 marcas do grupo (cobertura de RAM/BYD/Denza é incerta na FIPE — ver `CLAUDE.md` §6).

```bash
npm prune --omit=dev

# FRONTEND
cd ../frontend
npm ci --include=dev
npm run build
rm -rf node_modules
```

```bash
RELEASE_DIR=$(dirname "$(pwd)")   # você está em .../releases/TIMESTAMP/frontend
[ -f "$RELEASE_DIR/frontend/dist/index.html" ] || { echo "✖ dist/index.html não existe em $RELEASE_DIR — build falhou, não avance."; exit 1; }
[ -f "$RELEASE_DIR/backend/dist/server.js" ]   || { echo "✖ backend/dist/server.js não existe em $RELEASE_DIR — build falhou, não avance."; exit 1; }

ln -sfn "$RELEASE_DIR" /var/www/dva-veiculos/current
readlink -f /var/www/dva-veiculos/current
```

---

## 6 · Nginx — novo site, mesmo Nginx do sistema antigo (3 min)

Não mexe em `/etc/nginx/sites-available/procar` nem no symlink dele — só soma um `server{}` novo, roteado pelo próprio `server_name` (Nginx escolhe pelo cabeçalho `Host`, sem conflito com o site antigo).

Uploads de fotos/vídeo de veículo (`CLAUDE.md` §3, até 200MB de vídeo) são maiores que o `client_max_body_size` do site antigo — por isso este bloco tem o seu próprio, maior.

```bash
sudo tee /etc/nginx/conf.d/dva-limits.conf > /dev/null <<'EOF'
limit_req_zone $binary_remote_addr zone=dva_api:10m rate=10r/s;
EOF

sudo tee /etc/nginx/sites-available/dva-veiculos > /dev/null <<'EOF'
server {
    listen 80;
    server_name dva.procarservice.com.br;
    root /var/www/dva-veiculos/current/frontend/dist;
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
        limit_req zone=dva_api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3334/api/;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Vídeo de até 200MB (CLAUDE.md §3/upload.ts) em rede de tablet/loja —
        # o timeout padrão (60s) derruba upload/download grande antes de terminar.
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }

    # Fotos (até 8, 15MB cada) + 1 vídeo (até 200MB) num único multipart —
    # margem acima do maior arquivo aceito pelo multer (upload.ts).
    client_max_body_size 250M;
}
EOF

sudo ln -sfn /etc/nginx/sites-available/dva-veiculos /etc/nginx/sites-enabled/dva-veiculos
sudo nginx -t && sudo systemctl reload nginx
```

### ⚠️ PORTÃO E — confirma que o site antigo continua no ar
```bash
sudo nginx -t
curl -s -o /dev/null -w "%{http_code}\n" https://guia.procarservice.com.br     # ainda 200
ls /etc/nginx/sites-enabled/                                                   # 'procar' e 'dva-veiculos', os dois
```

---

## 7 · HTTPS (1 min)

```bash
sudo certbot --nginx -d dva.procarservice.com.br
sudo certbot renew --dry-run
```

Certbot reescreve só o `server{}` de `dva.procarservice.com.br` (identificado pelo `server_name`) — não toca no bloco do site antigo.

---

## 8 · PM2 — novo processo, mesmo daemon (2 min)

⚠️ Nunca `sudo pm2`. Não precisa rodar `pm2 startup` de novo — o daemon do usuário `procar` já está registrado como serviço (feito pelo deploy do sistema antigo); um segundo `pm2 start` só soma outro processo nesse mesmo daemon, e `pm2 save` (ao final) grava os dois juntos.

```bash
cat > /var/www/dva-veiculos/shared/ecosystem.config.js <<'EOF'
module.exports = {
  apps: [{
    name: 'dva-veiculos-api',
    script: 'dist/server.js',
    cwd: '/var/www/dva-veiculos/current/backend',
    instances: 1,          // NUNCA cluster: rate limit em memória
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '300M',
    kill_timeout: 5000,
    env: { NODE_ENV: 'production' },
    error_file: '/var/www/dva-veiculos/shared/logs/error.log',
    out_file:   '/var/www/dva-veiculos/shared/logs/out.log',
    time: true,
  }],
};
EOF

pm2 start /var/www/dva-veiculos/shared/ecosystem.config.js
pm2 save
```

### ⚠️ PORTÃO F
```bash
pm2 status                       # 'procar-api' E 'dva-veiculos-api', os dois 'online'
curl -s http://127.0.0.1:3334/api/health
systemctl is-enabled pm2-procar  # já era 'enabled' antes — continua sendo, nada muda aqui
```

---

## 9 · Scripts de deploy e backup (3 min)

```bash
cat > /var/www/dva-veiculos/shared/backup-db.sh <<'EOF'
#!/bin/bash
set -euo pipefail
DEST=/var/backups/dva-veiculos; mkdir -p "$DEST"
ARQ="$DEST/db-$(date +%Y-%m-%d_%H%M).sql.gz"
mysqldump --defaults-extra-file=/var/www/dva-veiculos/shared/.my.cnf \
  --single-transaction --quick --no-tablespaces --routines --triggers --events \
  dva_veiculos | gzip > "$ARQ"
gzip -t "$ARQ" || { echo "ERRO: corrompido"; exit 1; }
gunzip -c "$ARQ" | tail -5 | grep -q "Dump completed" || { echo "ERRO: incompleto"; exit 1; }
echo "$(date '+%F %T') OK $ARQ ($(du -h "$ARQ" | cut -f1))"
find "$DEST" -name "db-*.sql.gz" -mtime +14 -delete
EOF

cat > /var/www/dva-veiculos/shared/backup-files.sh <<'EOF'
#!/bin/bash
set -euo pipefail
DEST=/var/backups/dva-veiculos; mkdir -p "$DEST"
ARQ="$DEST/config-$(date +%Y-%m-%d_%H%M).tar.gz"
tar -czf "$ARQ" /var/www/dva-veiculos/shared/backend/.env /var/www/dva-veiculos/shared/frontend/.env \
  /var/www/dva-veiculos/shared/ecosystem.config.js /etc/nginx/sites-available/dva-veiculos \
  /etc/nginx/conf.d/dva-limits.conf 2>/dev/null || true
echo "$(date '+%F %T') OK $ARQ"
find "$DEST" -name "config-*.tar.gz" -mtime +14 -delete
EOF

sudo mkdir -p /var/backups/dva-veiculos && sudo chown procar:procar /var/backups/dva-veiculos
chmod +x /var/www/dva-veiculos/shared/backup-*.sh
/var/www/dva-veiculos/shared/backup-db.sh          # PORTÃO G: precisa imprimir OK
/var/www/dva-veiculos/shared/backup-files.sh
```

> Uploads de foto/vídeo (`backend/uploads/`, disco local — `CLAUDE.md` §2/§3) **não entram** nesses scripts de backup. São arquivos grandes e crescem sem limite; se quiser protegê-los, um `rsync` incremental separado (ex. para outra máquina) é mais adequado que empacotar tudo em `.tar.gz` diário. Registrado como pendência — decida antes do primeiro cadastro real de veículo em produção.

```bash
cat > /var/www/dva-veiculos/deploy.sh <<'EOF'
#!/bin/bash
set -euo pipefail
APP_DIR=/var/www/dva-veiculos
REPO_URL="github.com-dva:Ryangsl/procar-dva.git"
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
pm2 describe dva-veiculos-api >/dev/null 2>&1 && pm2 restart dva-veiculos-api --update-env \
  || pm2 start "$APP_DIR/shared/ecosystem.config.js"

OK=0
for i in $(seq 1 15); do
  curl -sf --max-time 2 http://127.0.0.1:3334/api/health >/dev/null 2>&1 && { OK=1; break; }
  sleep 2
done

if [ "$OK" -eq 1 ]; then
  echo "✅ Deploy OK: $TS"
  cd "$APP_DIR/releases" && ls -1t | tail -n +6 | while read -r a; do
    [ "$(readlink -f "$APP_DIR/current")" != "$APP_DIR/releases/$a" ] && rm -rf "$a"
  done
else
  echo "❌ Falhou. Revertendo."
  [ -n "$ANTERIOR" ] && ln -sfn "$ANTERIOR" "$APP_DIR/current" && pm2 restart dva-veiculos-api --update-env
  echo "pm2 logs dva-veiculos-api --lines 50 --nostream"
  exit 1
fi
EOF
chmod +x /var/www/dva-veiculos/deploy.sh
```

```bash
(crontab -l 2>/dev/null; cat <<'EOF'
10 3 * * * /var/www/dva-veiculos/shared/backup-db.sh >> /var/www/dva-veiculos/shared/logs/backup.log 2>&1
15 3 * * * /var/www/dva-veiculos/shared/backup-files.sh >> /var/www/dva-veiculos/shared/logs/backup.log 2>&1
EOF
) | crontab -
crontab -l    # confira que os 4 horários (dois do site antigo + dois daqui) aparecem, sem duplicar
```

Horários (`03:10`/`03:15`) escalonados dos do sistema antigo (`03:00`/`03:05`) de propósito — os dois `mysqldump` correm na mesma instância MySQL, e rodar tudo no mesmo minuto competiria por I/O à toa.

---

## 10 · Validação final (2 min)

```bash
curl -s https://dva.procarservice.com.br/api/health                                   # {"status":"ok"...}
curl -sI http://dva.procarservice.com.br | head -1                                     # 301 (redirect do Certbot)
curl -sI https://dva.procarservice.com.br/index.html | grep -ci "content-security"     # 1
pm2 status                                                                              # os DOIS processos 'online', fork, 1 instância cada
curl -s -o /dev/null -w "%{http_code}\n" https://guia.procarservice.com.br             # 200 — sistema antigo intacto
sudo fail2ban-client status
sudo reboot
```

Após o reboot:
```bash
pm2 status && systemctl is-active nginx mysql fail2ban
curl -s -o /dev/null -w "%{http_code}\n" https://dva.procarservice.com.br              # 200
curl -s -o /dev/null -w "%{http_code}\n" https://guia.procarservice.com.br             # 200
```

**No navegador:** entrar em `https://dva.procarservice.com.br` com `admin@procar.com` (email de exemplo — o real é o que `db:setup` exibiu no terminal) + `ADMIN_SENHA_INICIAL` → trocar a senha → criar um operador em `/usuarios` → cadastrar um veículo completo (fotos + vídeo) → conferir o protocolo gerado → checar Monitoramento. Em paralelo, confirme que `https://guia.procarservice.com.br` (sistema antigo) continua funcionando normalmente.

---

## 11 · Atalho `dva-veiculos` (2 min, opcional)

Mesmo padrão do atalho `procar` já instalado para o sistema antigo, mas apontando pro diretório e processo deste sistema. Os dois comandos coexistem (nomes diferentes, `/usr/local/bin/procar` não é sobrescrito).

```bash
sudo tee /usr/local/bin/dva-veiculos > /dev/null <<'EOF'
#!/bin/bash
set -euo pipefail
APP_DIR=/var/www/dva-veiculos

if [ "$(id -u)" -eq 0 ]; then
  echo "Não rode 'dva-veiculos' com sudo/root — rode como o usuário procar." >&2
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
    pm2 logs dva-veiculos-api --lines "${2:-50}" --nostream
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
    pm2 restart dva-veiculos-api --update-env
    echo "✔ Revertido para $PREV"
    ;;
  backup)
    "$APP_DIR/shared/backup-db.sh"
    "$APP_DIR/shared/backup-files.sh"
    ;;
  *)
    echo "Uso: dva-veiculos {update|status|logs [N]|rollback|backup}"
    exit 1
    ;;
esac
EOF
sudo chmod +x /usr/local/bin/dva-veiculos

dva-veiculos status
```

`dva-veiculos status` chama `pm2 status` (mesmo daemon do sistema antigo), então mostra os **dois** processos — intencional, é uma visão de saúde da VPS inteira. `dva-veiculos logs`/`rollback`/`update` só afetam `dva-veiculos-api`.

---

## Uso diário

```bash
dva-veiculos update                              # atualizar (SEMPRE por aqui, nunca git pull manual em current/)
dva-veiculos rollback                            # reverter para o release anterior (pede confirmação)
dva-veiculos status                              # pm2 (os dois sistemas) + disco + memória
dva-veiculos logs                                # últimas 50 linhas do log deste backend
```

O comando `procar` (sistema antigo) continua funcionando exatamente como antes, sem qualquer alteração.

**Backups:** cron às `03:10`/`03:15` (ver seção 9), em `/var/backups/dva-veiculos/`, retendo 14 dias — independentes dos backups do sistema antigo (`/var/backups/procar/`).

---

## Se algo der errado

| Sintoma | Comando |
|---|---|
| `dva.procarservice.com.br` não abre, `guia.procarservice.com.br` continua ok | `sudo nginx -t; sudo tail -30 /var/log/nginx/error.log` — provavelmente só o `server{}` novo tem erro |
| API do DVA dá 502 | `pm2 logs dva-veiculos-api --lines 50 --nostream` |
| Upload de vídeo grande falha/trava | Confira `client_max_body_size 250M` e `proxy_read_timeout 180s` no site `dva-veiculos` (seção 6) — não são os mesmos valores do site antigo |
| Cross-database falha (`vehicle_brands` não aparece) | `mysql -u dva_app -p painel_procar -e "SELECT 1;"` — se der access denied, faltou o `GRANT SELECT` da seção 2 |
| `git clone` do DVA falha, mas `git clone` do antigo funciona | Confirme o alias `github.com-dva` em `~/.ssh/config` e teste `ssh -T git@github.com-dva` isoladamente |
| Backup do DVA falhando | Falta `--no-tablespaces` (privilégio PROCESS) — mesmo motivo do sistema antigo, script próprio já inclui a flag |
| PM2 não sobe o `dva-veiculos-api` no boot | Não precisa de novo `pm2 startup` — confira só `pm2 save` foi executado após o `pm2 start` da seção 8 |

---

## Portas e coexistência — visão final

| Porta/recurso | Sistema antigo | Grupo ProCar (procar-dva) |
|---|---|---|
| 22 SSH | compartilhada | compartilhada |
| 80/443 Nginx | compartilhado — `server{}` por `server_name` | compartilhado — `server{}` por `server_name` |
| Backend (127.0.0.1) | `3333` | `3334` |
| MySQL (127.0.0.1) | mesma instância, banco `painel_procar` | mesma instância, banco `dva_veiculos` (+ leitura em `painel_procar`) |

Para um **terceiro** sistema na mesma VPS: repita este padrão — porta livre (ex. `3335`), banco/usuário MySQL próprio, `server{}` Nginx com `server_name` próprio, processo PM2 com nome próprio no mesmo daemon. `sudo ss -tlnp` confirma portas livres antes de escolher uma nova.
