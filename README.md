# Button Press Logger

A static web app with four colored buttons and a timer. While the timer is running, every button press is logged with its color, the elapsed time and a wall-clock timestamp. Logs can be exported as CSV or JSON and are saved in the browser, so they survive a page reload.

## Using it

1. Optionally type a **Session ID** (for example `P01`). If you leave it blank, an ID is generated from the start time.
2. Press **Start**. The colored buttons become active.
3. Click or tap the buttons, or press the keys `1`–`4` (Red, Blue, Green, Yellow). Presses made while the timer is paused or stopped are ignored.
4. Use **Pause/Resume** as needed. Press **Stop & end session** when you're done.
5. Under **Export**, choose *All sessions* or a single session, then click **Download CSV** or **Download JSON**.

**Undo last** removes the most recent press. **Clear log** deletes everything (it asks you to confirm first).

### On a phone

- The four buttons fill the screen. The log and export controls are below them, so scroll down to reach them.
- The line under the timer confirms each tap, for example "Last: Blue at 00:12.345 · 7 total". On Android the phone also vibrates briefly. (iOS doesn't allow websites to trigger vibration.)
- The screen stays on while the timer is running. This needs the HTTPS GitHub Pages link.
- **Stop** asks for confirmation, so a stray tap won't end a session.
- For a full-screen app with no browser bars: on iOS, open the link in Safari and tap Share → Add to Home Screen. On Android, open it in Chrome and choose ⋮ → Add to Home screen.

### CSV columns

| column | meaning |
| --- | --- |
| `session_id` | Session the press belongs to |
| `press_number` | 1, 2, 3… within that session |
| `button_index` | 1–4 |
| `button_color` | Red / Blue / Green / Yellow |
| `elapsed_ms` | Timer time at the press, in milliseconds (paused time excluded) |
| `elapsed` | Same, formatted `mm:ss.mmm` |
| `timestamp_iso` | Wall-clock time of the press (UTC, ISO 8601) |
| `session_start_iso` | Wall-clock time the session started (UTC) |

## Data persistence

The log and the timer state are stored in the browser's `localStorage`. Reloading the page, even while the timer is running, keeps everything, and the timer continues from where it was. Data is kept **per browser, per device**. Clearing site data or using a private window will lose it, so export regularly.

## Hosting on GitHub Pages

1. Push `index.html`, `style.css` and `app.js` to the root of a GitHub repository.
2. In the repository, go to **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, then `main` and `/ (root)`, and save.
3. After a minute the app will be live at `https://<username>.github.io/<repository>/`.

There's no build step and there are no dependencies. You can also just open `index.html` locally.
