# Своя игра Online v2 — база вопросов + защита от повторов

Онлайн-игра для двух команд. Ведущий создает комнату, игроки подключаются с телефонов.

## Главное в v2

Теперь проект использует:

```text
questionsDB.json
```

Это структурированная база вопросов по темам и сложности:

```text
easy
medium
hard
```

А также:

```text
usedQuestions.json
```

Это история уже использованных вопросов. Она нужна, чтобы вопросы не повторялись между разными комнатами.

## Как работает генерация

При создании комнаты сервер:

1. Создает уникальный seed.
2. Выбирает 15 тем.
3. Для каждого раунда выбирает вопросы нужной сложности.
4. Проверяет вопрос по хэшу.
5. Если вопрос уже использовался раньше — берет другой.
6. Если чистых вопросов не хватает — создает параметрическую задачу с новыми числами.
7. Записывает выданные вопросы в `usedQuestions.json`.

## Повторы

| Уровень | Защита |
|---|---|
| Внутри одной комнаты | Да |
| Между комнатами | Да, через `usedQuestions.json` |
| После ручного сброса истории | История очищается |
| Когда база закончится | Включаются параметрические задачи |

## Локальный запуск

```bash
npm install
npm start
```

Открыть:

```text
http://localhost:3000
```

## Render

Build Command:

```bash
npm install
```

Start Command:

```bash
npm start
```

Переменные окружения не нужны.

## Как расширять базу

Открой:

```text
questionsDB.json
```

Формат:

```json
{
  "Тема": {
    "easy": [
      ["Вопрос", "Ответ"]
    ],
    "medium": [
      ["Вопрос", "Ответ"]
    ],
    "hard": [
      ["Вопрос", "Ответ"]
    ]
  }
}
```

## Сброс истории вопросов

В интерфейсе ведущего есть кнопка:

```text
Сбросить историю вопросов
```

Она очищает `usedQuestions.json`.

## v3 additions

- Ведущий сразу видит правильный ответ в модалке вопроса.
- Игроки не видят ответ, пока ведущий не нажмет "Показать ответ игрокам".
- Добавлен таймер вопроса: 15, 30 или 60 секунд.
- Добавлена кнопка "Отменить последнее" — откатывает последнее начисление и снова открывает вопрос на поле.
- Добавлен прогресс раунда и всей игры.
- Добавлен экспорт текущего пакета вопросов в JSON.

## v4 additions

- Лобби готовности игроков: каждый игрок нажимает "Я готов", ведущий видит счетчик.
- QR-код комнаты для быстрого входа с телефона.
- Режим большого экрана: отдельная ссылка для ТВ/проектора без кнопок ведущего.
- Блокировка кнопок "ЖМУ!" ведущим.
- Ручная корректировка очков по ±100.
- Импорт собственного пакета вопросов из JSON.
- Звук и вибро у игроков при новом вопросе.
- Финальный экран победителя.

## v5 professional additions

- Настройки комнаты до старта:
  - таймер по умолчанию;
  - разрешить/запретить минусовые очки;
  - автоблокировка кнопок после первого нажатия.
- Восстановление комнаты ведущим по коду после перезапуска/обрыва.
- Автосохранение комнат в `roomsSnapshot.json`.
- Журнал событий игры.
- Назначение капитанов команд.
- Апелляции от игроков ведущему.
- Скрытые финальные ставки с телефонов игроков/капитанов.
- Командные заметки для финала.
- Расширенные настройки комнаты во время игры.

## v6 App Store Ready additions

- PWA manifest and service worker.
- Privacy Policy, Terms and Safety pages.
- Onboarding modal.
- Russian presets: классика, для России, студенты, вечеринка, корпоратив.
- Moderation tools:
  - player reports;
  - host report resolution;
  - kick player;
  - basic text filtering.
- Russia-focused question categories.
- App Store readiness documentation: `APP_STORE_READINESS.md`.

## iOS Capacitor wrapper

Prepared files:
- `capacitor.config.ts`
- `IOS_CAPACITOR_README.md`
- `ios-prep/`
- `APP_STORE_READINESS.md`

Generate iOS project on macOS:

```bash
npm install
npx cap add ios
npx cap sync ios
npx cap open ios
```

For native iOS, set `SVoyaBackendUrl` in `public/client.js` to your hosted backend URL before `npx cap sync ios`.

## Production backend URL

For Capacitor/iOS builds, backend is set in `public/client.js`:

```js
const SVoyaBackendUrl = "https://svoya-online-game.onrender.com";
```

After changing this value, run:

```bash
npx cap sync ios
```


## Render stable mode

For web deployment on Render, the client now connects with same-origin Socket.IO:

```js
const socket = isNativeCapacitorRuntime() ? io(SVoyaNativeBackendUrl) : io();
```

This prevents room mismatch between the website and backend.

Debug endpoints:

```text
/api/health
/api/rooms
```

Service worker cache is disabled for live multiplayer stability.