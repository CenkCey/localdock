# iOS setup

## Requirements

- A Mac with Xcode 26 or newer
- Node.js 22 or newer
- An Apple ID (a free account works for installing on your own phone, the app must be re-signed every 7 days)

## Build

```bash
cd client
npm install
npm run ios
```

`npm run ios` builds the web app, syncs it into the native project and opens Xcode.

## Signing

The repository does not contain any signing identity. In Xcode:

1. Select the **App** target.
2. Open *Signing & Capabilities*.
3. Pick your **Team**.
4. Change the **Bundle Identifier** to something unique, for example `com.yourname.localdock`.
5. Pick your iPhone and press Run.

Keep `appId` in `client/capacitor.config.json` in step with your bundle identifier if you change it there.

## Local network permission

On first launch iOS asks for access to the local network. Allow it, otherwise the phone cannot reach the PC.

## Web preview without a phone

```bash
cd client
npm run fake
npm run dev
```

Open the printed URL and connect to the fake server address.
