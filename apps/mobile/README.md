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
error alert and allow a manual retry. No automatic playback retry, synthesis,
word refresh, or generation polling is added. Home blur/unmount, app background,
and OS playback interruptions stop and release pronunciation. Silent-mode playback
is enabled; microphone permissions and background audio are disabled in app config.
The continuous-session control remains its existing placeholder: no session player
currently exists to coordinate with. The existing design and routes are preserved.

Validation from `apps/mobile`:

```sh
npx tsc --noEmit
npx expo lint
node --test tests/*.test.cjs
```

The tests use native-player stubs and render the actual row component with native
host stubs. They cover URL resolution, playback races/replay/errors/timeouts,
focus/background cleanup, and the absence of an icon or reserved control spacing
for null, undefined, empty and whitespace audio references. Native device playback
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
   for this test. Confirm rows with no audio reference have no play control or gap.
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
