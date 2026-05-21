# Daily Research — iOS

Native iOS port of the Daily Research study companion.
Built with Expo + React Native. Same look (Fraunces + Newsreader fonts, paper palette),
running natively on iPhone with on-device storage for streak + history.

## Setup

```bash
cd ~/Projects/daily-research-ios
npm install
```

## Run on iOS

```bash
npx expo start --ios
```

That launches the iOS Simulator (requires Xcode installed from the App Store).
To run on a real device, install **Expo Go** from the App Store, run `npx expo start`,
and scan the QR code.

## API key

The app calls the Anthropic API directly from the device. On first launch tap the
settings icon (top right of the masthead) and paste a key that starts with `sk-ant-`.
The key is stored locally via AsyncStorage — it never leaves the device.

> Note: Bundling an API key inside a shipped mobile app is **not** safe for App Store
> distribution. For TestFlight/App Store, route requests through your own backend
> (e.g. Cloudflare Worker or Vercel function) that holds the key server-side.

## Build for TestFlight / App Store

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile preview   # TestFlight build
```

You will need an Apple Developer account ($99/yr).

## Project structure

- `App.js` — single-file app: masthead, topic toggle, paper card, history, settings modal
- `app.json` — Expo config (bundle id, splash, icon)
- `package.json` — deps: expo, lucide-react-native, async-storage, expo-google-fonts
