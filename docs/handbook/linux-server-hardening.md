# Настройка кибербезопасности Linux-сервера

Базовые практики защиты сервера, на котором крутится это приложение
(и, в перспективе, касса на отдельном поддомене — см.
[deployment.md](./deployment.md)). Ориентировано на Ubuntu/Debian
(`apt`) — для других дистрибутивов команды пакетного менеджера будут
отличаться, но сами принципы универсальны.

## 1. Обновления

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

Включает автоматическую установку security-патчей без ручного
вмешательства.

## 2. SSH

- **Только по ключу, отключить вход по паролю.** В
  `/etc/ssh/sshd_config`:
  ```
  PasswordAuthentication no
  PermitRootLogin no
  ```
  Перед отключением пароля — убедитесь, что ваш публичный ключ уже
  добавлен в `~/.ssh/authorized_keys` нужного пользователя и вы можете
  зайти по нему, иначе рискуете потерять доступ.
- Перезапустить: `sudo systemctl restart sshd`.
- Рассмотрите смену порта SSH с 22 на нестандартный — не защита сама по
  себе, но заметно снижает шум от автоматического сканирования.
- Установить `fail2ban` для бана IP после нескольких неудачных попыток:
  ```bash
  sudo apt install fail2ban -y
  sudo systemctl enable --now fail2ban
  ```

## 3. Firewall

```bash
sudo apt install ufw -y
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # или ваш нестандартный SSH-порт
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Открывайте только реально нужные порты. PostgreSQL (5432) **не** должен
быть в этом списке, если БД используется только локально самим
приложением (см. п.6).

## 4. Отдельный непривилегированный пользователь под приложение

Не запускайте Node.js-процесс от root:

```bash
sudo adduser --system --group --home /opt/easy-work app
sudo chown -R app:app /opt/easy-work
```

Деплойте код в `/opt/easy-work` (или другой путь) от имени этого
пользователя, процесс-менеджер (см. п.5) тоже запускает его от `app`, а
не от `root`.

## 5. Процесс-менеджер: systemd

Пример unit-файла `/etc/systemd/system/easy-work.service`:

```ini
[Unit]
Description=Easy Work Next.js app
After=network.target postgresql.service

[Service]
Type=simple
User=app
Group=app
WorkingDirectory=/opt/easy-work
EnvironmentFile=/opt/easy-work/.env
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=5
# Ограничение ресурсов — процесс не должен иметь возможность положить
# весь сервер при утечке памяти/бесконечном цикле.
MemoryMax=1G
CPUQuota=200%

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now easy-work
```

`EnvironmentFile` подхватывает `.env` — убедитесь, что права на файл
`600` и владелец `app` (см. п.7).

## 6. PostgreSQL

- Слушать только localhost (или приватную сеть, если БД на отдельном
  хосте), не `0.0.0.0`: в `postgresql.conf`:
  ```
  listen_addresses = 'localhost'
  ```
- В `pg_hba.conf` — не использовать `trust`, минимум `scram-sha-256`.
- Сложный пароль для роли приложения (`DATABASE_URL`), не `postgres`/пусто.
- Регулярный `pg_dump` в бэкап (см. п.9).

## 7. Права на `.env` и секреты

```bash
chmod 600 /opt/easy-work/.env
chown app:app /opt/easy-work/.env
```

`.env` не должен быть в git — проверьте `.gitignore` перед первым
коммитом на сервере/деплоем. Особое внимание —
**`ENCRYPTION_MASTER_KEY`**: это мастер-ключ, из которого выводятся
ключи шифрования секретов каждой организации (вендорские
пароли/ОФД-credentials — см. `lib/crypto.ts`/`lib/org-dek.ts`).

- Храните его копию отдельно от сервера (менеджер секретов, оффлайн —
  на случай полной потери сервера, иначе все зашифрованные данные
  становятся невосстановимы).
- **Процедура ротации при компрометации**: смена этого ключа "на лету"
  не предусмотрена текущим кодом (нет built-in re-encryption pipeline) —
  при компрометации потребуется написать одноразовый скрипт, который
  для каждой организации расшифровывает существующие секреты старым
  ключом и заново шифрует новым, прежде чем менять переменную окружения
  и перезапускать сервис. Не меняйте `ENCRYPTION_MASTER_KEY` без такой
  миграции — иначе все существующие зашифрованные данные станут
  нечитаемыми.

## 8. TLS

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d ваш-домен.ру -d kassa.ваш-домен.ру
```

`certbot` сам настроит nginx на TLS и редирект с HTTP на HTTPS,
автообновление сертификата ставится автоматически (systemd timer
`certbot.timer`) — проверить: `sudo systemctl list-timers | grep certbot`.

## 9. Бэкапы БД

Минимум — ежедневный `pg_dump`, хранение вне самого сервера (другой
хост/объектное хранилище):

```bash
pg_dump "$DATABASE_URL" | gzip > /backups/easy-work-$(date +%F).sql.gz
```

Настройте через cron, ротацию старых бэкапов (например, хранить 30
дней), и **периодически проверяйте, что восстановление из бэкапа
реально работает** — непроверенный бэкап равносилен отсутствию бэкапа.

## 10. Логи

- Ротация логов systemd (journald) — по умолчанию уже ограничена
  (`SystemMaxUse` в `/etc/systemd/journald.conf`), проверьте, что не
  растёт бесконечно.
- Если nginx/Caddy пишут access-логи — настроить `logrotate` (обычно
  уже настроен пакетом по умолчанию на Ubuntu/Debian).

## 11. Общий принцип

Каждый из пунктов выше снижает конкретный риск (перебор SSH-паролей,
сканирование открытых портов, компрометация БД при её случайной
доступности извне, потеря данных при падении диска, необратимая потеря
секретов при потере ключа). Ни один пункт не является взаимозаменяемым
с другими — это независимые слои защиты, применяйте все.
