# LocalDock Protocol (v2)

Transport: Socket.io v4 (websocket transport) plus a few plain HTTP routes, both on `http://<PC_LOCAL_IP>:3000`. Payloads are JSON objects. Server and client read only this file to agree on the protocol. Everything here is mandatory unless marked optional.

## 1. Discovery and pairing

### HTTP `GET /hello` (no auth)

```json
{ "app": "localdock", "name": "STUDIO-PC", "platform": "windows", "version": "2.0.0", "pinLength": 6 }
```

Used by the client to show "Available / Not found" for saved PCs and to read the PC name before connecting.

### Flow

1. Client connects the socket.
2. Server emits `PIN_REQ`.
3. Client emits `AUTH` with either `{ "token": "<saved>" }` (a previously paired PC) or `{ "pin": "123456" }`.
4. Server answers `AUTH_RESULT`.
5. Only after `ok: true` may the client emit anything else. Any other event before that gets `EXEC_RESULT` with `error: "UNAUTHORIZED"` (for events that carry an `id`) or is ignored.

If the client has a saved token it should send `AUTH {token}` immediately after connecting without waiting for `PIN_REQ`. If the server rejects the token (`BAD_TOKEN`) it keeps the socket open and emits `PIN_REQ` again; the client then shows the PIN sheet.

### PIN_REQ (server -> client)

```json
{ "pinLength": 6, "attemptsLeft": 5, "name": "STUDIO-PC" }
```

### AUTH (client -> server)

```json
{ "pin": "123456" }
```

```json
{ "token": "9f2c...64 hex chars" }
```

### AUTH_RESULT (server -> client)

Success:

```json
{
  "ok": true,
  "name": "STUDIO-PC",
  "token": "9f2c...64 hex chars",
  "httpKey": "a1b2...32 hex chars",
  "actions": ["OPEN_CMD", "VOLUME_UP"],
  "caps": { "volume": true, "brightness": false, "media": true, "input": true, "clipboard": true, "capture": true, "upload": true, "apps": true }
}
```

- `token` is present only when the PIN was used. The server stores only a SHA-256 hash of it in its data directory, so pairing survives server restarts. The client saves it per PC.
- `httpKey` is random per socket connection and must be sent as query parameter `k` on the HTTP routes in section 6. It stops working when that socket disconnects.
- `caps` tells the client which features to show. A false cap means: hide that control.

Failure:

```json
{ "ok": false, "error": "BAD_PIN", "attemptsLeft": 3 }
```

`error` values: `BAD_PIN`, `BAD_TOKEN`, `TOO_MANY_ATTEMPTS` (server disconnects right after), `BAD_PAYLOAD`.
Limits: 5 wrong PINs per socket, plus the server blocks an IP for 60 seconds after 10 wrong PINs within 5 minutes (answers `TOO_MANY_ATTEMPTS`). Unauthenticated sockets are disconnected after 30 seconds. A wrong token does not count against attempts.

## 2. Commands with an id

Every client -> server event below that has an `id` (string, client generated, 1-40 chars) is answered with exactly one `EXEC_RESULT`:

```json
{ "id": "c1a2", "ok": true }
```

```json
{ "id": "c1a2", "ok": false, "error": "BUSY" }
```

Extra result fields are allowed where stated (`file`, `thumb`).
`error` values: `UNAUTHORIZED`, `UNKNOWN_ACTION`, `BAD_PARAMS`, `BUSY`, `TIMEOUT`, `EXEC_FAILED`, `NOT_SUPPORTED`, `NOT_FOUND`, `TOO_LARGE`.

Windows-side work that shells out runs one at a time behind a lock. A second command arriving while another one runs is answered `BUSY`. Reads from memory (`LAYOUT_GET`, `APPS_GET`, `CLIPBOARD_GET`, `STATE_GET`) never wait for the lock.

### EXEC_CMD (built-in actions)

```json
{ "id": "c1a2", "action": "VOLUME_UP", "params": { "steps": 5 } }
```

Raw shell strings are never accepted. Actions:

| action | params | effect |
|---|---|---|
| `OPEN_CMD` | none | opens a new Command Prompt window |
| `OPEN_CALC` | none | opens Calculator |
| `OPEN_TASKMGR` | none | opens Task Manager |
| `SHOW_DESKTOP` | none | toggles show desktop |
| `LOCK_PC` | none | locks the Windows session |
| `SLEEP_PC` | none | puts the PC to sleep |
| `VOLUME_UP` / `VOLUME_DOWN` | `steps` int 1-25, default 5 | volume keys, 2% per step |
| `VOLUME_MUTE` | none | toggles mute |
| `MEDIA_PLAY_PAUSE` / `MEDIA_NEXT` / `MEDIA_PREV` | none | media keys |

Shutdown and restart are intentionally not offered (unsaved work would be lost).

### SET_VOLUME / SET_BRIGHTNESS

```json
{ "id": "v1", "value": 40 }
```

`value` integer 0-100. Only offered when `caps.volume` / `caps.brightness` is true, otherwise `NOT_SUPPORTED`. The server updates and pushes `STATE`.

## 3. Live state

### STATE (server -> client)

Pushed right after `AUTH_RESULT` and then whenever something changed (the server polls at most every 2 seconds while at least one client is authenticated, and only emits on change):

```json
{
  "volume": 40,
  "muted": false,
  "brightness": 70,
  "media": { "status": "playing", "title": "Golden Hour Drive", "artist": "The Sample Tapes", "thumb": "data:image/jpeg;base64,..." }
}
```

- `brightness` is `null` when the display cannot be controlled.
- `media` is `null` when nothing is playing. `status` is `playing`, `paused` or `stopped`. `thumb` is optional (small JPEG data URL, max about 40 KB) or `null`.

### STATE_GET (client -> server)

```json
{ "id": "s1" }
```

Server answers with a `STATE` event (and `EXEC_RESULT ok`).

## 4. Dock layout, apps, launching

The layout lives on the PC so it is shared by every phone. Display preferences (theme, icons per page) stay on the phone.

### Layout shape

```json
{
  "version": 1,
  "pages": [
    {
      "id": "p1",
      "tiles": [
        { "id": "t1", "kind": "action", "ref": "OPEN_CMD", "label": null },
        { "id": "t2", "kind": "app", "ref": "app_3fa9c1", "label": "Visual Studio Code" },
        { "id": "t3", "kind": "folder", "ref": "C:\\Users\\me\\Documents", "label": "Documents" },
        { "id": "t4", "kind": "url", "ref": "https://example.com", "label": "Example" }
      ]
    }
  ]
}
```

- `kind`: `action` (ref is an EXEC_CMD action id), `app` (ref is an app id from `APPS`), `folder` (ref is a path), `url` (ref is an http or https URL).
- `label`: string up to 60 chars or `null` (client falls back to a default name for actions and to the app name for apps).
- Ids match `^[A-Za-z0-9_-]{1,40}$`. Limits: 12 pages, 64 tiles per page, `ref` up to 500 chars. Pages may be empty. At least 1 page.
- Default layout (no file yet): every action, in the table order of section 2, chunked into pages of 8.

### LAYOUT_GET (client -> server)

```json
{ "id": "l1" }
```

Server answers with a `LAYOUT` event `{ "layout": { ... } }` and `EXEC_RESULT ok`.

### LAYOUT_SET (client -> server)

```json
{ "id": "l2", "layout": { "version": 1, "pages": [] } }
```

Replaces the whole layout. Invalid shapes answer `BAD_PARAMS`. For `kind: "app"` the ref must exist in the apps index, `kind: "url"` must be a valid http(s) URL, `kind: "action"` must be a known action, otherwise `BAD_PARAMS`. On success the server stores it (file `layout.json` in its data dir), broadcasts `LAYOUT` to every other authenticated client and answers `EXEC_RESULT ok`.

### APPS_GET (client -> server)

```json
{ "id": "a1", "refresh": false }
```

Server answers with `APPS` and `EXEC_RESULT ok`:

```json
{ "apps": [ { "id": "app_3fa9c1", "name": "Visual Studio Code" } ] }
```

Sorted by name, de-duplicated. `refresh: true` rescans the Start Menu (Windows) first. App ids are stable hashes of the shortcut path. Icons: `GET /icons/<id>.png?k=<httpKey>` (see section 6); the server extracts them once and caches them in its data dir.

### LAUNCH (client -> server)

```json
{ "id": "x1", "kind": "app", "ref": "app_3fa9c1" }
```

- `app`: server looks the id up in its own index and starts that shortcut. The client never sends a program path.
- `folder`: opens the folder in Explorer. `NOT_FOUND` if it does not exist or is not a directory.
- `url`: opens the http(s) URL in the default browser. Anything else is `BAD_PARAMS`.
- Actions are not launched with `LAUNCH`; use `EXEC_CMD`.

## 5. Touchpad, keyboard, clipboard, capture, signature

### INPUT (client -> server, no id, no answer)

High frequency, fire and forget, only when `caps.input`. Server rate-limits to about 120 events per second per client and drops the rest silently.

```json
{ "type": "move", "dx": 4, "dy": -2 }
{ "type": "click", "button": "left", "count": 1 }
{ "type": "down", "button": "left" }
{ "type": "up", "button": "left" }
{ "type": "scroll", "dy": -3, "dx": 0 }
{ "type": "key", "key": "esc" }
{ "type": "text", "text": "hello" }
```

- `dx`, `dy` integers clamped to -200..200 (pixels). `scroll` values clamped to -20..20 (notches).
- `button`: `left`, `right`, `middle`. `count`: 1 or 2.
- `key`: `esc`, `tab`, `delete`, `backspace`, `enter`, `space`, `up`, `down`, `left`, `right`, `home`, `end`, `pageup`, `pagedown`.
- `text`: up to 200 characters, typed into the focused PC field (unicode allowed).
- Invalid events are ignored.

### Clipboard

The server watches the PC clipboard and keeps the last 10 distinct text items (each up to 5000 chars, newest first).

```json
{ "id": "k1" }
```

`CLIPBOARD_GET` -> server answers `CLIPBOARD` and `EXEC_RESULT ok`. `CLIPBOARD` is also pushed to all authenticated clients when the list changes:

```json
{ "items": [ { "id": "cb_1", "text": "Shopping list", "at": 1760000000000 } ] }
```

`CLIPBOARD_PASTE`:

```json
{ "id": "k2", "itemId": "cb_1" }
```

Puts that item on the clipboard and sends Ctrl+V to the focused PC window. `NOT_FOUND` for unknown items.

`CLIPBOARD_SEND`:

```json
{ "id": "k3", "text": "from my phone", "paste": true }
```

Sets the PC clipboard to `text` (max 10000 chars, `TOO_LARGE` beyond) and, when `paste` is true, sends Ctrl+V.

### CAPTURE_SCREENSHOT

```json
{ "id": "m1" }
```

Saves a full resolution PNG to the PC folder `Pictures\LocalDock` and answers `EXEC_RESULT` with extra fields `file` (file name) and `thumb` (small JPEG data URL, max about 40 KB):

```json
{ "id": "m1", "ok": true, "file": "screenshot-20261110-021500.png", "thumb": "data:image/jpeg;base64,..." }
```

Screen recording is not part of this version.

### SIGNATURE_SEND

```json
{ "id": "g1", "png": "<base64 without data: prefix>", "insert": true }
```

Decoded PNG max 2 MB (`TOO_LARGE`). Saved to `Pictures\LocalDock\Signatures\signature-<timestamp>.png`. When `insert` is true the image is also put on the clipboard and Ctrl+V is sent. Answer has extra field `file`.

## 6. HTTP routes (all need `?k=<httpKey>` except `/hello`)

- `GET /icons/<appId>.png?k=...` returns a 64x64 or larger PNG. Unknown id: 404. Bad key: 401.
- `POST /upload?k=...&name=<url-encoded file name>` with the raw file as request body (`Content-Type: application/octet-stream`). The server sanitises the name (strip paths and reserved characters), saves into the PC folder `Downloads\LocalDock`, numbers duplicates (`name (1).ext`), refuses files above 2 GiB (413) and answers:

```json
{ "ok": true, "file": "photo.jpg" }
```

All routes answer CORS (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Content-Type`, `OPTIONS` preflight handled), because the iOS app page is served from `capacitor://localhost`.

## 7. Data directory (server)

`%APPDATA%\LocalDock` on Windows, or the folder in env `LOCALDOCK_DATA` (default `./data` in development). Holds `trusted.json` (token hashes), `layout.json` and `icons/`.

## 8. Rules

- Default port 3000, PIN is 6 digits, generated randomly at every server start (existing tokens keep working).
- Clients never send program paths or shell text. Only action ids, app ids from the apps index, folder paths to open and http(s) URLs.
- Development mode: env `LOCALDOCK_DEV=1` lets the server run off Windows with fake data and echoing commands, so tests can run anywhere.
