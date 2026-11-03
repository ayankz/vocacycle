# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **example** directory and create a blank **src/app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Word pronunciation playback (Issue #8)

Home's Recent Words controls play the backend's existing `pronunciationAudioUrl`
through `expo-audio` (~58.0.11 for Expo SDK 58). A relative reference such as
`/words/23/pronunciation` resolves against `EXPO_PUBLIC_API_URL`. Only HTTP(S)
URLs on that backend's origin are accepted; credentials, fragments, local-file
URLs and other origins are rejected. This supports local LAN HTTP development.

A single controller owns Home's active pronunciation. The tapped control shows a
spinner while preparing/buffering and an amber tint while playing. Other words
remain tappable; switching releases the previous player and ignores its delayed
events. Every tap, including during loading, supersedes the previous request.
Tapping while playing restarts
the word; tapping after completion plays it again. Completion releases the player.

Playback starts once the current native player reports `isLoaded`, rather than
issuing `play()` immediately after `replace()`. A synchronous readiness check also
covers cached sources. A ready-status snapshot is not treated as a pause, and only
native playing status changes the UI to playing. Request tokens guard readiness,
errors, completion, preparation continuations and timeouts from older taps.

The current player uses `keepAudioSessionActive: true` until it is explicitly
removed. In expo-audio 58.0.11 on iOS, pause/completion can schedule session
deactivation 100 ms later; with the old false setting, a previous player's queued
teardown could deactivate the session while its replacement was loading. Waiting
for readiness and holding the current player's session prevents that handoff race.
This adds no delay or retry, and does not enable background playback. Removal on
completion, failure, blur or background releases the session keeper.

Network/native errors or a ten-second preparation/buffering timeout show a short
error alert and allow a manual retry. No automatic playback retry or synthesis is performed. Issue #25 adds bounded
availability refreshes separately from the playback controller. Home blur/unmount, app background,
and OS playback interruptions stop and release pronunciation. Silent-mode playback
is enabled; microphone permissions and background audio are disabled in app config.
A session player and real resumable-session source are not implemented. Home
omits Continue Listening entirely, with no mock card or empty-state message. The
existing session-detail API does not expose playable audio, duration or listening
progress, so Home cannot determine which session is resumable (Issue #5).
The reusable card component is retained for future integration. Other Home
sections and routes are unchanged.

Validation from `apps/mobile`:

```sh
npx tsc --noEmit
npx expo lint
node --test tests/*.test.cjs
```

The tests use native-player stubs and render the actual row component with native
host stubs. They cover URL resolution, playback races/replay/errors/timeouts,
focus/background cleanup, and disabled unavailable controls for null, undefined, empty and whitespace
audio references (updated by Issue #25). Native device playback
still requires the following manual check.

### Expo Go on a physical iPhone

1. Use an Expo Go version that supports this project's Expo SDK 58. `expo-audio`
   is included in Expo Go; no custom development build or microphone permission
   is required for this foreground playback feature.
2. Connect the iPhone and development computer to the same Wi-Fi. Start the API
   listening on its LAN interface (the repository's `make api` uses port 5126).
   API and Worker must share the directory containing the existing pronunciation
   files through `VOCACYCLE_STORAGE`. Playback itself does not need the Worker or
   generation providers running.
3. In the ignored `apps/mobile/.env`, set `EXPO_PUBLIC_API_URL` to the computer's
   reachable origin, for example `http://192.168.1.10:5126`. Use your actual LAN
   address; `localhost` on the iPhone refers to the phone. Restart Expo after an
   environment change.
4. Open `<API origin>/words` in iPhone Safari. Confirm apple (ID 23) has
   `pronunciationAudioUrl: "/words/23/pronunciation"`. Open
   `<API origin>/words/23/pronunciation` and confirm the existing audio is reachable.
   These requests do not generate audio.
5. From `apps/mobile`, run `npx expo start --go`. Scan the QR code with the iPhone
   Camera and open the app in Expo Go. Allow Local Network access if iOS asks.
6. On Home, expand Recent Words if necessary and tap apple's play control. Expect
   a brief spinner followed by the pronunciation, with no placeholder alert.
   At LAN speed the loading/active state may be very brief. Repeat after completion
   and tap rapidly during playback; each tap should replay without overlap.
7. If another saved word already has audio, switch rapidly between its control
   and apple's. Only the latest word should play. Do not generate extra audio just
   for this test. Confirm rows with no audio reference show a disabled neutral icon and
   `Audio unavailable`, or `Generating audio…` within a new word’s polling window.
8. Navigate to another tab during loading/playback, then return. Also background
   the app or open Control Center mid-playback. Audio should stop, controls should
   reset, and returning should not automatically resume. A new tap should work.
9. Stop the API and tap a word with existing audio availability. Expect a graceful
   error (or the ten-second timeout), with the spinner cleared. A device cache may
   allow an already-loaded recording to play; test a different uncached existing
   recording if available. Restart the API and verify manual retry works. For a
   stale/missing reference check, temporarily move an existing MP3 aside, tap its
   still-visible control without refreshing the list, then restore the file. Do
   not delete database records or reset synthesis claims.
10. Toggle the iPhone's silent switch and verify pronunciation remains audible at
    an appropriate media volume. No microphone permission, background playback,
    or lock-screen controls should be requested by this feature.

SDK reference: https://docs.expo.dev/versions/v58.0.0/sdk/audio/


## Pronunciation status UX (Issue #25)

Recent Words keeps generation availability separate from native playback status.
Newly added words without an audio URL show a compact circular spinner and
`Generating audio…`. A single list-wide GET refresh timer checks every two seconds
(after the preceding request settles), with a maximum of 90 pronunciation polling
attempts per new word. Translation/IPA retain their independent five-attempt
budget while sharing that request and timer. Audio availability ends that word's
pronunciation polling immediately. Requests time out after eight seconds; failures
and timeouts consume attempts. No refresh requests generate or regenerate audio.

**API limitation:** `GET /words` exposes a nullable `pronunciationAudioUrl`, not a
job status. Null can mean queued, failed, missed enqueue, or missing storage. The
mobile pending state is therefore a bounded inference for locally added words,
not a confirmed backend generation status. Exhausted words and previously saved
words without a URL show `Audio unavailable` with a disabled neutral icon. There
is no generation retry action and no backend/schema change. Focus/foreground
refresh can discover audio that arrives after the budget expires, but does not
restart exhausted budgets. Pending budgets live in memory, not across app restarts.

Home blur/unmount and app inactivity cancel polling and abort in-flight requests.
Returning to focused, foreground Home refreshes once and resumes remaining
budgets. Request generation guards discard stale responses, including responses
arriving after a focus change. Delayed Add callbacks retain the new word without
publishing to an inactive screen.

Home also supports native pull-to-refresh, with an amber indicator on iOS and
Android. Pull down at the top of Home to fetch current translations, IPA and audio
URLs through the same words controller. GET requests bypass cached responses.
Manual refresh works after polling has exhausted its budget and does not restart
that budget or generate audio. An arriving audio URL changes the row to Ready
independently of IPA.

Repeated pulls are coalesced. A pull during an existing GET queues one fresh GET
after it, with no concurrent list requests. The refresh indicator covers that
queued request and clears on success or failure; failures preserve the current
words and use the existing error label. The eight-second timeout releases the
request slot even if cancellation does not settle the transport promise, and late
responses cannot update state. Blur/background cancels refresh; returning to Home
resets the indicator and refreshes through the existing focus lifecycle. Pulling
does not stop or recreate the pronunciation player.

Ready controls remain tappable during native loading; every tap still supersedes
the previous playback request. The playback controller and its iOS audio-session
settings are unchanged. Playing turns the word text and playback glyph amber,
adds a restrained amber border and animated bars, and retains the translation.
Completion/switching restores the previous row. Glyphs fade in over 200 ms; bar
animations use native transforms, stop on unmount and respect Reduce Motion.
The generation spinner has a dark circular background, a muted charcoal track
and a short warm amber arc rotating continuously once per second. It uses the
existing SVG dependency and native-driven React Native animation, unmounts when
the Play control appears, and stops its loop/subscription on cleanup. Reduce
Motion keeps the arc static. Native playback loading retains its existing small
indicator. No percentages or progress bars are used for generation.
Status and translation share a compact secondary line that wraps on narrow
screens/large text rather than hiding status behind a truncated translation.

Additional physical-iPhone review (use the LAN/API setup above):

1. With the API and worker running, add a new English word. Confirm the generating
   spinner and label appear, then the play control appears automatically when the
   API exposes its MP3, with no manual refresh. Translation/IPA arriving first must
   not stop pronunciation checks. Use an already approved provider configuration;
   adding a word can invoke the backend's existing paid fallback.
2. Tap a ready word once. Confirm reliable first-tap audio, amber **word text**,
   amber bars/control and a subtle card border. Confirm translation remains visible
   and completion restores normal styling. Short recordings may make this brief.
3. Tap repeatedly during loading and playing, then rapidly switch between two
   ready words. Only the latest request should play; the previous word must lose
   its amber styling immediately. Repeat after completion.
4. With the worker stopped, add a word and leave Home foregrounded. After 90 polls
   (about three minutes on a fast connection; longer with slow/timed-out requests),
   expect `Audio unavailable` and a disabled icon, with no regeneration action.
   Restarting the worker may process queued work using existing provider settings.
5. Navigate away, background the app, and return during pending generation and
   during playback. Verify polling pauses outside foreground Home, no audio
   continues, and stale responses do not restore old states. Remaining budgets
   resume; exhausted budgets do not restart. Ready audio never auto-plays.
6. Stop the API and tap an uncached ready word: the existing playback alert and
   ten-second timeout remain, with no stuck amber state or loading indicator.
   Restoring connectivity allows another playback tap without regenerating audio.
7. Pull down at the top of Home. Confirm the native indicator is amber and clears
   when words refresh. Repeat after polling has stopped, during playback, and
   while the API is offline. Playback should continue; offline refresh should keep
   the list, stop the indicator after the request timeout, and show the existing
   error. Each GET has an eight-second bound; a queued pull can take longer.
   Returning connectivity should allow another pull. Pull while a poll is in
   flight and navigate away mid-refresh to check serialization and cleanup.
8. Enable Reduce Motion and larger text. Confirm static bars under Reduce Motion,
   readable status/translation and disabled/busy/selected VoiceOver control states.

Automated validation uses `npx tsc --noEmit`, `npx expo lint`,
`node --test tests/*.test.cjs` and `git diff --check`. Native iPhone behavior and
visual fidelity still require the manual checks above.


### Physical-iPhone synchronization investigation (Nov 3, 2026)

The earlier report that bike (ID 27) stayed on `Generating audio…`, including
after leaving and returning to Home, remains **not reproduced or explained**.
Do not treat it as fixed by a speculative synchronization change.

Read-only inspection of the connected Expo Go runtime confirmed the 90-attempt
limit was loaded, bike's audio URL was present in both the controller and React
state, and its rendered row received `pronunciationStatus: ready`. A GET through
the iPhone's loaded `getWords` function also returned the ready URL. Metro was
running from this mobile workspace. Glasses (ID 29) was observed pending and
then ready automatically; the device user confirmed its translation, IPA and
playback availability appeared successfully. These observations verify the
current flow, not the cause of bike's earlier failure. No synchronization,
readiness, lifecycle, API, backend or worker change was made for that report.

To investigate a recurrence, capture the affected word ID, file/database/API
availability and the still-stuck controller/React/row state before reloading.
IPA remains independent of audio readiness.


## Swipe-to-delete in Recent Words

Swipe left to reveal a muted red trash/Delete action. Swiping fully never deletes;
only tapping Delete (or the word text's VoiceOver Delete action) does. Opening one
row closes the previous row. The existing gesture-handler and Reanimated libraries
provide UI-thread gestures/animations; no new animation dependency was added.

A removal fades/scales the row over 200 ms (1 → 0 opacity, 1 → 0.96 scale).
Height and the row's own spacing collapse over 250 ms starting at 100 ms: the whole
transition takes 350 ms and moves neighbors smoothly. Undo expands/fades the same
row instead of re-adding it. System Reduce Motion skips these transitions. Normal
pronunciation UI and native pull-to-refresh remain intact. Only deletion of the
currently playing word stops/releases that clip; other playback continues.

The bottom snackbar says `Word removed` and offers Undo for five seconds, above
the tab/safe area. One pending removal is supported at a time so every accepted
removal retains its complete Undo opportunity; other words remain playable and
scrollable. Further deletions are disabled until Undo or completion.

Before hiding a card, its ID/snapshot/deadline is persisted using SDK-compatible
`expo-sqlite/kv-store`, scoped to the configured API origin. Undo clears this
journal before restoring the card and makes no Add/TTS calls. At expiry, the client
sends idempotent DELETE /words/{id}. No regeneration is performed. Confirmed API
rejection restores the card with an error. If a DELETE response is lost, a GET
checks whether the word actually remains before restoring it. If confirmation is
also unavailable, the pending operation is retained with an error; pull-to-refresh
or the next focused/foreground Home visit reconciles it. It never falsely restores
a word the server may already have deleted.

Background/blur cancels timers and requests. The persisted wall-clock deadline,
not a background JS timer, governs recovery after force-close/relaunch. An expired
operation completes on the next foreground Home visit; no execution is guaranteed
while the app is suspended/terminated. SQLite failures prevent initial hiding or
retain the operation rather than silently losing intent.

Backend removal archives the word using `DeletedAt` so existing sessions keep their
word text, translation, IPA and examples. Only the standalone pronunciation file is
removed; session recordings are untouched. New enrichment claims skip deleted
words. Final pronunciation publication and DELETE use the same short PostgreSQL
row lock, preventing in-flight work from recreating deleted files. An already-sent
provider request cannot be recalled, but its output is discarded after deletion.

Apply `AddWordDeletion` and restart API **and** worker together before device use:

```sh
# Repository root; do not apply to a database you did not intend to migrate.
dotnet ef database update --project libs/infrastructure --startup-project apps/api
```

The API now needs write/unlink permission in the shared `pronunciations/` directory.
No development database migration or real vocabulary deletion was performed during
implementation. Backend checks use an isolated disposable database and stubbed HTTP.
Physical-iPhone validation remains necessary for swipe/scroll arbitration, the
350 ms dissolve and neighboring movement, five-second Undo, force-close/relaunch,
Reduce Motion/VoiceOver, playback and native pull-to-refresh.

## Pairs session player

Audio Ready and the current-session Audio Library entry open `/audio/player/[id]`.
The player streams the existing API MP3 and reads its timeline; neither operation
creates audio. Native playback events drive position, buffering and duration.
Timeline timestamps drive EN/RU speech highlighting, actual silence intervals,
word selection and previous/next navigation. Drag or tap the seek bar, use ±15s,
or use VoiceOver's adjustable seek actions. Playback speed supports 0.75×, 1×, 1.25× and 1.5×; Loop repeats
the existing MP3 natively without synthesis. A missing timeline leaves ordinary
audio controls available and offers a read-only reload.

The existing `expo-audio` config plugin now enables background playback. A new
Expo development build is required for these native settings to take effect;
background/locked-screen behavior cannot be validated from an old binary or
assumed from Expo Go. Session playback configures silent-mode/background audio,
lock-screen metadata and native play/pause/seek controls. App background and phone
lock and tab switches retain the player and its current position. Unmount, session
replacement or explicit playback retry releases it. Only one session owns playback. Home pronunciation
keeps its separate foreground-only lifecycle. No microphone permission is enabled.

This change was reviewed by reading the source only. No tests, builds, lint,
type checks, paid requests or native device verification were performed. Manually
verify stream startup, seek and word boundaries, buffering/error recovery, repeat,
headphone interruptions, foreground restoration and lock-screen controls on iPhone
and Android using existing recordings.

The Pairs player remains inside the existing Audio tab. Native tabs stay visible,
retain the Audio stack when reselected, and handle the tab bar's bottom inset through
the existing screen-safe-area component. No second tab bar is rendered. The Active
Cadence card is omitted; the word badge still follows real EN/RU/pause timeline state.

The session selector reads `GET /audio-sessions` and filters/deduplicates ready
sessions. The backend in this checkout currently exposes detail/audio/timeline GETs
only, so collection GET returns 404/405. In that case the selector explains the
limitation and retains only the real current-session option. Listing every ready
session requires a collection endpoint; this frontend change does not add one.
