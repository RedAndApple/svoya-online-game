# App Store Readiness Plan

Этот проект — веб-версия игры. Для публикации в App Store нужна нативная iOS-сборка.

## Рекомендуемый путь

1. Завернуть приложение через Capacitor.
2. Добавить нативный splash screen и app icon.
3. Проверить, что приложение не выглядит как пустой WebView.
4. Оставить серверную часть на Render/VPS.
5. В App Store Connect указать:
   - категорию Games / Trivia;
   - возрастной рейтинг;
   - privacy nutrition labels;
   - ссылку на Privacy Policy;
   - тестовый доступ для ревьюера.

## Что уже добавлено в v6

- Privacy Policy.
- Terms.
- Safety page.
- Модерация пользовательского контента:
  - жалобы;
  - удаление игроков;
  - апелляции;
  - базовая фильтрация текста.
- Нет аккаунтов, поэтому не требуется удаление аккаунта.
- Нет real-money gambling.
- Нет внешних платежей.
- PWA manifest.
- Service worker.
- Онбординг.
- Российские пресеты и темы.
- Режим большого экрана.

## Что еще нужно перед App Store

- Нативная iOS-оболочка.
- iOS app icon всех размеров.
- App Store screenshots.
- Тестирование на iPhone/iPad.
- Политика обработки данных в App Store Connect.
- Контакт поддержки.
- Страница удаления данных, если появятся аккаунты.

## Capacitor iOS structure added

The project now contains:
- `capacitor.config.ts`
- `tsconfig.json`
- iOS prep folder: `ios-prep/`
- App Store metadata draft
- Privacy manifest semantic template
- Info.plist checklist
- Export compliance note
- Xcode checklist

Native `ios/` folder should be generated locally:

```bash
npm install
npx cap add ios
npx cap sync ios
npx cap open ios
```

## Native backend URL

Before building native iOS, set the hosted backend URL in `public/client.js`:

```js
const SVoyaBackendUrl = "https://svoya-online-game.onrender.com";
```

Then run:

```bash
npx cap sync ios
```