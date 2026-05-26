---
name: YM API auth
description: Как работает авторизация Яндекс Маркет API и обход TLS-блокировки
---

## Правило
Токен для Яндекс Маркет Partner API должен быть стандартным Яндекс OAuth (`y0_AgAAAA...` или `AgAAAA...`).  
Токен `ACMA:...` — это IAM-токен Яндекс Облака, он не работает с Market Partner API (возвращает 403 "OAuth token is invalid").

**Why:** Node.js fetch (undici) и нативный `https` тоже падают с ETIMEDOUT к `93.158.134.216:443` — Яндекс блокирует TLS-fingerprint Node.js с GCP IP. curl с того же IP работает нормально.

**How to apply:** `ym-api.ts` на сервере использует `execFileAsync("curl", [...])` вместо fetch. Схема авторизации: `ACMA:` → `Bearer`, всё остальное → `OAuth`.

## Что нужно сделать при продолжении
1. Пользователю нужно получить правильный OAuth-токен с partner.market.yandex.ru → Настройки → Доступ к API (или через oauth.yandex.ru, client_id `8b0fce67da654a5c99bc5e3cef42ec71`)
2. После получения правильного токена ЯМ API должен заработать — curl-подход уже работает
