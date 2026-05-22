<div align="center">

<img src="assets/icon.png" width="120" alt="Daily Research icon" />

# Daily Research

**One research paper a day — read in full, explained like you're 5.**

A native iOS study companion for AI and financial-markets research.
Built with Expo + React Native.

</div>

---

## What it does

- **Fetches one real, recent (2025–2026) paper a day** — arXiv, SSRN, NBER, or a reputable lab blog
- **Toggle topic**: AI / machine learning, or financial markets / investing
- **Plain-English summary** — problem, key idea, why it matters, plus a study question
- **In-app paper viewer** — the actual paper (HTML on arXiv, native PDF render elsewhere) opens *inside* the app, no Safari trip
- **Full progressive read-through** — walk the paper section by section in plain English, with "Continue reading" until done
- **👶 Explain like I'm 5 chatbot** — context-aware tutor that knows the paper, holds a conversation, and uses real-world analogies (pizza, LEGO, bikes)
- **Streak + history** — daily study streak, last 30 papers, all on-device

## How it's built

| | Stack |
|---|---|
| **Framework** | [Expo](https://expo.dev) 51 + React Native 0.74, JavaScript (no TS) |
| **AI providers** | Anthropic Claude (Sonnet 4.5) **or** Google Gemini 2.5 Flash — auto-detected from key prefix (`sk-ant-…` vs `AIza…`) |
| **Web search** | Anthropic's `web_search` tool / Gemini's `google_search` grounding — both inject live citations into the paper search |
| **Paper rendering** | `react-native-webview` (WKWebView under the hood); arXiv `/abs/` URLs auto-rewrite to `/html/` for mobile-friendly HTML with rendered math |
| **Persistence** | `@react-native-async-storage/async-storage` — streak, history, API key all local |
| **Typography** | [Fraunces](https://fonts.google.com/specimen/Fraunces) (display) + [Newsreader](https://fonts.google.com/specimen/Newsreader) (body), loaded via `expo-google-fonts` |
| **Icons** | `lucide-react-native` |
| **Layout** | `useWindowDimensions` + `useSafeAreaInsets` driven scale factor (0.82×–1.30×) + proportional padding; adapts SE → Pro Max + Dynamic Island + home indicator |
| **Keyboard handling** | `KeyboardAvoidingView` + scrim-tap dismiss for Settings and Chat modals |
| **Resilience** | 429/529 detection with `retry-after` header parsing, one-shot auto-retry; lenient markdown-style parser for streaming reads survives truncation |

## Setup

```bash
git clone https://github.com/julianfellyco/daily-research-ios.git
cd daily-research-ios
npm install
```

### Run on iOS Simulator

```bash
npx expo run:ios
```

Requires Xcode + the iOS platform SDK matching your simulator's OS.

### Run on a real iPhone (free, 7-day install)

1. Plug iPhone in, trust the Mac
2. Add your Apple ID to Xcode → Settings → Accounts
3. Run:
   ```bash
   npx expo run:ios --device "<Your iPhone Name>" --configuration Release
   ```
4. On first launch: Settings → General → VPN & Device Management → Trust the developer

### API key (one-time)

Tap the **gear** icon top-right and paste either:
- Anthropic key — `sk-ant-…` ([console.anthropic.com](https://console.anthropic.com))
- Gemini key — `AIza…` ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)) — free tier has higher rate limits

The key lives only in on-device AsyncStorage. It is not bundled or sent anywhere except directly to the provider's API. For App Store distribution you'd want a tiny backend proxy holding the key server-side instead.

## Build for TestFlight / App Store

Requires an Apple Developer Program account ($99/yr).

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile preview     # ad-hoc install
eas build --platform ios --profile production  # store-ready
```

## Project layout

```
App.js                  # single-file app — all UI + state
app.json                # Expo config (bundle id, icon, splash)
assets/                 # icon.png + splash.png (paper-themed)
scripts/gen-assets.py   # regenerate icon + splash from palette
LICENSE                 # MIT
```

## License

MIT © 2026 Julian Fellyco
