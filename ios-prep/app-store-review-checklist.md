# App Store Review Checklist

## Before archive in Xcode

1. Run:

```bash
npm install
npx cap add ios
npx cap sync ios
npx cap open ios
```

2. In Xcode:
- Team: your Apple Developer account.
- Bundle Identifier: `ru.svoyaigra.online`.
- Display Name: `Своя Игра`.
- Version: `1.0.0`.
- Build: `1`.
- Signing: Automatically manage signing.
- Deployment target: iOS 15.0 or higher.

3. Add app icons:
- use `public/assets/icon-512.svg` as source;
- generate required iOS icon sizes through Xcode asset catalog or an icon generator.

4. Add Privacy Manifest:
- create/copy `PrivacyInfo.xcprivacy`;
- use `ios-prep/PrivacyInfo.xcprivacy.json` as the semantic template.

5. Verify URLs:
- Privacy Policy URL must point to a public page.
- Support URL must point to a public support/contact page.

## App Store Connect fields

- Name: `Своя Игра Онлайн`
- Subtitle: `Командная онлайн-викторина`
- Category: Games
- Subcategory: Trivia
- Age rating: likely 4+, unless you add unrestricted user-generated content without moderation.
- Keywords: `викторина, своя игра, квиз, quiz, вечеринка, вопросы, команды, игра`

## Review notes

Use:

```text
Приложение не требует аккаунта. Для теста: откройте приложение, создайте комнату как ведущий, затем с другого устройства подключитесь по коду или QR. Пользовательский контент модерируется ведущим комнаты: есть жалобы, удаление игроков, апелляции и правила безопасности.
```

## Must test

- Host creates room.
- Player joins room.
- QR link works.
- Big screen mode works.
- Buzz button works.
- Host sees answer.
- Appeal works.
- Report player works.
- Kick player works.
- Final wager works.
- Winner screen works.
- App resumes after background/foreground.
