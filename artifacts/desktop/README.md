# Unit Economics — Десктопное приложение

Нативное Windows-приложение на Electron. Все API-запросы к WB, Ozon и ЯМ идут с вашего компьютера (не через облако), поэтому WB Statistics API работает без прокси.

## Сборка .exe на Windows

### Требования
- [Node.js 20+](https://nodejs.org/) (устанавливается один раз)
- [pnpm](https://pnpm.io/installation): `npm install -g pnpm`

### Шаги

```bat
git clone <ваш репозиторий>
cd <папка проекта>

REM Установить все зависимости
pnpm install

REM Собрать frontend + сервер + создать Setup.exe
cd artifacts\desktop
node build.mjs --dist-win
```

Готовый инсталлятор появится в:
```
artifacts\desktop\dist-electron\Unit Economics Setup 1.0.0.exe
```

Запустите `Unit Economics Setup 1.0.0.exe` — приложение установится и создаст ярлык на рабочем столе.

## Быстрый запуск (без сборки .exe)

```bat
REM Собрать без упаковки
node build.mjs

REM Запустить напрямую через Electron
npx electron .
```

## Архитектура

```
Electron main process
  └─ запускает Express API-сервер на localhost:7890
       ├─ /api/wb/*    → statistics-api.wildberries.ru  (с вашего IP!)
       ├─ /api/ozon/*  → api-seller.ozon.ru
       ├─ /api/ym/*    → api.partner.market.yandex.ru
       └─ /*           → React SPA (статические файлы)

Electron renderer (native window)
  └─ загружает http://localhost:7890
```

## Хранение данных

- API-ключи хранятся в `localStorage` браузерного движка Electron  
  Путь: `%APPDATA%\Unit Economics\Local Storage`  
  Ключи **не покидают ваш компьютер**.

## Обновление иконки

Поместите файл `icon.ico` (256×256 px) в `artifacts/desktop/build-resources/icon.ico` перед сборкой.
