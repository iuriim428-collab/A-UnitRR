# Локальный запуск AD Unit R

## Быстрый старт (Docker Compose)

Самый простой способ — всё в одной команде:

```bash
# 1. Клонировать проект
git clone https://github.com/iuriim428-collab/AD-Unit-R.git
cd AD-Unit-R

# 2. (Опционально) задать пароль от приложения
export APP_PASSWORD=123321Qq

# 3. Запустить
docker compose up -d

# 4. Применить схему БД (только первый раз)
docker compose exec api node -e "
  const { db } = require('./dist/index.mjs');
" || npx -y tsx scripts/migrate-local.ts
```

После запуска открыть: **http://localhost:3000**

---

## Ручной запуск (без Docker)

### Требования
- Node.js 20+
- pnpm 9+
- PostgreSQL 15+

### Шаги

```bash
# 1. Установить зависимости
npm install -g pnpm@9
pnpm install

# 2. Создать .env файл
cp .env.example .env
# Отредактировать .env — вставить DATABASE_URL

# 3. Применить схему БД
pnpm --filter @workspace/db run push

# 4. Запустить API сервер (порт 8080)
pnpm --filter @workspace/api-server run dev &

# 5. Запустить веб-приложение (порт 5173)
pnpm --filter @workspace/wb-optimizer run dev
```

Открыть: **http://localhost:5173/wb**

---

## .env файл

Создайте файл `.env` в корне проекта:

```env
# PostgreSQL — строка подключения
DATABASE_URL=postgresql://postgres:password@localhost:5432/adunit

# Секрет для сессий (любая случайная строка)
SESSION_SECRET=замените-на-случайную-строку

# Пароль для входа в приложение
APP_PASSWORD=123321Qq
```

### Создать БД в PostgreSQL

```sql
CREATE DATABASE adunit;
CREATE USER adunit WITH PASSWORD 'adunit';
GRANT ALL PRIVILEGES ON DATABASE adunit TO adunit;
```

---

## Архитектура

```
AD-Unit-R/
├── artifacts/
│   ├── api-server/      # Express 5 API (порт 8080)
│   └── wb-optimizer/    # React + Vite фронтенд
├── lib/
│   └── db/              # Drizzle ORM схема
└── docker-compose.yml   # Готовый к запуску Docker Compose
```

**API сервер** слушает на `/api/*` и проксирует запросы к маркетплейсам (WB, Ozon, ЯМ).

**Веб-приложение** — SPA на React, обращается только к `/api/`.

---

## Обновление

```bash
git pull
pnpm install
pnpm --filter @workspace/db run push   # если изменилась схема
# Перезапустить сервисы
```

С Docker:
```bash
git pull
docker compose build
docker compose up -d
```
