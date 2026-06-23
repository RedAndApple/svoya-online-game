# iOS Capacitor Wrapper

This project is prepared for Capacitor.

## Requirements

- macOS
- Node.js 18+
- Xcode
- CocoaPods
- Apple Developer account for real device/App Store distribution

## Generate iOS project

Run from project root:

```bash
npm install
npx cap add ios
npx cap sync ios
npx cap open ios
```

After this, Xcode will open `ios/App/App.xcworkspace`.

## Bundle ID

Use:

```text
ru.svoyaigra.online
```

## App name

```text
Своя Игра
```

## Server model

This iOS wrapper loads the local web bundle from `public/`.
The multiplayer server remains Node.js on Render/VPS.

For production, keep your hosted server URL stable.
If you later split client/server into separate packages, update Socket.IO connection in `public/client.js`.

## Files added

- `capacitor.config.ts`
- `tsconfig.json`
- `ios-prep/app-store-metadata.ru.json`
- `ios-prep/Info.plist.checklist.xml`
- `ios-prep/PrivacyInfo.xcprivacy.json`
- `ios-prep/app-store-review-checklist.md`
- `ios-prep/export-compliance.md`

## Important

The generated `ios/` folder is not included because Capacitor should generate native templates on your Mac with your installed Xcode/CocoaPods environment.


## Production backend

Already configured in `public/client.js`:

```js
const SVoyaBackendUrl = "https://svoya-online-game.onrender.com";
```

Run after edits:

```bash
npx cap sync ios
```