# Development

## Philosophy

Start simple and build small, reviewable changes. Prefer boring, explicit solutions, testable business logic, and a modular monolith. Add abstractions and infrastructure only when a real requirement justifies them. Never commit secrets or prematurely implement future features.

VocaCycle is both a product and a portfolio-grade engineering project. Decisions should be explainable in a technical interview and useful to the product, rather than expanding the technology list for its own sake.

## Learning constraint

The developer has commercial React, Angular, and TypeScript experience; C#/.NET is newer, and the project also develops React Native, AWS, and production engineering skills.

Keep work small enough to understand and review. Explain important C#/.NET behavior and decisions, briefly compare reasonable alternatives, and avoid unnecessary framework magic or large unexplained architecture changes.

## Vertical slices

After this foundation is reviewed, implement one useful workflow at a time across the required layers. The illustrative progression is:

1. Add Word → API → PostgreSQL → Vocabulary UI.
2. Select Words → Create Audio Session.
3. Generate Examples → focused LLM abstraction.
4. TTS → audio processing → storage → timeline.
5. Mobile playback → background playback → lock-screen controls → repeat.

These are future slices, not authorization to implement them now. Refine their scope as product and technical decisions become concrete. Use the approved VocaCycle designs and design system when implementing UI. These designs will be transferred to Figma before frontend implementation.

## Working on a change

1. Read the relevant product, architecture, and development documentation.
2. Inspect existing code and conventions before proposing additions.
3. Choose a small scope and explain significant decisions and assumptions.
4. Implement only what the slice requires and update affected documentation.
5. Run appropriate available builds/tests and verify relevant behavior. Report checks that could not run and why.

## Future local development

Application tooling has not been installed or scaffolded. There are no application start, build, migration, or test commands yet.

When the corresponding slices are introduced:

- Document the selected supported Node, package-manager, Expo, and .NET SDK versions with real setup and execution commands.
- Use Expo Development Builds for the mobile app and device-specific audio validation.
- Provide a documented local PostgreSQL setup and explicit EF Core migration workflow.
- Document configuration for the mobile API endpoint, API database connection, and any introduced external integration.
- Keep credentials in local environment configuration or appropriate secret storage. Commit only secret-free examples of required configuration.
- Add AWS setup and infrastructure tooling only when cloud resources are actually needed.

Do not invent setup commands, provider credentials, or infrastructure requirements before those components exist.


## Word translation (Issue #18)

Use the installed .NET 10 SDK and the existing PostgreSQL configuration. Apply
existing EF migrations if necessary; this feature adds no migration. Start Redis
with `docker compose up -d redis` at the repository root. Redis 7+ is required for
pending-message reclaiming. Both hosts accept `ConnectionStrings__Redis` (default
`localhost:6379`). The existing audio group setup remains unchanged.

The worker defaults to **Ollama in Development** and **Google in Production**
(and other environments). Override explicitly with `Translation__Provider=Ollama`
or `Translation__Provider=Google` (JSON key `Translation:Provider`). Values are
case-insensitive. Empty or unknown values fail startup; there is no automatic
fallback. Provider selection affects only translation, not example generation.

For local translation, run Ollama at the existing `http://localhost:11434` endpoint
with `qwen3:1.7b` installed (`ollama pull qwen3:1.7b` if needed). Start the worker
with `DOTNET_ENVIRONMENT=Development`, or explicitly select Ollama. No Google key
is needed for Ollama. The named Ollama client and example generation settings are
unchanged. The translation job still has its existing 15-second processing bound;
a slow model cold start may time out and use the existing pending-job retry.

For Google, enable billing and the Cloud Translation API in your Google Cloud
project. Create an API key restricted to that API (and the worker's IP where
practical). Set `GoogleTranslation__ApiKey` in the worker environment, or use its
existing .NET user-secrets ID to store `GoogleTranslation:ApiKey`. Do not put the
key in source, command history, URLs, or any `EXPO_PUBLIC_*` variable. The worker
accepts standard .NET `ConnectionStrings__DefaultConnection` configuration for
PostgreSQL.

Run the API and worker from the repository root:

```sh
dotnet run --project apps/api
DOTNET_ENVIRONMENT=Development dotnet run --project apps/worker
```

The translation group is created automatically. Audio processing still uses
`vocacycle:audio:jobs` / `audio-workers` and its existing Ollama, TTS, storage and
consumer-group prerequisites. Ollama translation shares the existing Ollama
client, but never invokes example generation or TTS. Google translation does not
call either service.

For physical-device development, `make api` listens on `http://0.0.0.0:5126`.
In `apps/mobile`, copy `.env.example` to the ignored `.env` and replace the example
host in `EXPO_PUBLIC_API_URL` with your development computer's LAN IPv4 address.
The phone and computer must be able to reach each other on that network. Restart
Expo after changing the URL. Never commit `.env`; `EXPO_PUBLIC_*` values are
bundled into the mobile app and must contain no credentials.

`make worker` uses the worker's Development launch profile, selecting Ollama by
default. Makefile paths use repository-relative defaults for the existing sibling
`cosyvoice-test` checkout; override `COSYVOICE_DIR`, `COSYVOICE_PYTHON` or
`STORAGE_DIR` for a different layout. No developer-specific absolute paths are
required. Use the existing Expo development workflow. Validation commands:

```sh
# Repository root
dotnet build VocaCycle.slnx
git diff --check
# apps/mobile
npx tsc --noEmit
npx expo lint
node --test tests/recent-words-controller.test.cjs
```

Manual integration check: add an English word with no translation, observe the
201 response with `translation: null`, the translation worker receive/save logs,
and the Russian translation in `GET /words` and Home. Stop Redis and verify Add
still succeeds. With `Translation__Provider=Google` and a missing/invalid key,
verify the job stays pending, is reclaimed at 60-second intervals, and is acknowledged after three deliveries.
Verify the UI stops waiting after five polls; navigate away mid-request and return
after translation completes. Generate an audio session with the existing local
audio services to verify audio and translation consumers operate independently.

If enqueue fails, the saved word requires manual re-enqueue after Redis recovers;
there is no automatic database-to-stream reconciliation in this implementation.


## Dictionary IPA and word pronunciation (Issues #19 and #20)

Use .NET 10 and apply migrations before starting either host:

```sh
dotnet ef database update --project libs/infrastructure --startup-project apps/api
```

`AddWordPronunciation` adds nullable text columns `PronunciationAudioUrl` and
`DictionaryPronunciation`, plus `PronunciationSynthesisAttempted` defaulting to
false. Existing translation and IPA data are preserved. The internal checkpoint
columns are needed to avoid repeating dictionary work and paid synthesis across
restarts; they are not returned in API JSON.

Set `VOCACYCLE_STORAGE` to the same absolute directory for API and worker, with
read access for API and write access for worker. Pronunciation uses the existing
filesystem storage convention and creates its own `pronunciations/` subdirectory.
API returns relative `/words/{id}/pronunciation` references only when the stored
file exists; playback clients must resolve these against `EXPO_PUBLIC_API_URL`.
Use the LAN host instructions above for a physical iPhone. No localhost URL is
embedded in the response. Range requests are supported by the audio endpoint.

Free Dictionary API needs no key. Its IPA and audio metadata share one request.
Only explicitly CC0, US-labelled recordings from the approved API media host with
Wikimedia Commons provenance can be cached. Many dictionary recordings (including
the sampled apple US recording) use CC BY-SA and are conservatively ineligible in
this slice because the API lacks creator attribution. See ARCHITECTURE.md for the
full accent/licensing/security policy. Unknown licenses never authorize copying.

For ElevenLabs fallback, configure these **worker-only** values using environment
variables or the worker's existing .NET User Secrets store:

| Environment variable | Meaning |
| --- | --- |
| `ElevenLabs__ApiKey` | Secret API key; never place it in mobile/public config or logs |
| `ElevenLabs__VoiceId` | A voice you have verified produces American English |
| `ElevenLabs__VoiceAccent` | Explicit operator confirmation: `en-US` |
| `ElevenLabs__ModelId` | A TTS model available to your account; no silent default |
| `ElevenLabs__TimeoutSeconds` | Whole-request timeout, integer 1–20; template defaults to 15 |
| `ElevenLabs__OutputFormat` | `mp3_22050_32`, `mp3_44100_64`, or `mp3_44100_128` |

User Secrets keys use colons instead of double underscores. Never commit a real
key or use `EXPO_PUBLIC_*` for provider configuration. Config validation produces
safe diagnostics when fallback is unavailable; Add and IPA still work. The
existing full-session TTS service is unchanged. No examples are generated on Add.

Retry/cost policy: dictionary failures/downloads get at most three Redis deliveries,
with a 60-second reclaim interval. Translation has an independent group/budget.
ElevenLabs gets **one automatic attempt per word**, guarded by a durable conditional
database claim. No automatic paid retry occurs for ambiguous timeouts, network
failures, invalid audio, quota/rate-limit responses, or server errors. The
provider's documented endpoint offers no idempotency parameter. A crash after the
claim but before sending can therefore leave no recording. Investigate history,
billing and local files before manually resetting a claim and re-enqueuing;
ordinary refreshes never regenerate audio. New jobs carry `pronunciation=1`; old
retained stream entries are skipped by the pronunciation group to avoid paid
backfill. Missed best-effort publications still need manual re-enqueue.

Validation (no live ElevenLabs requests):

```sh
# Repository root
dotnet build VocaCycle.slnx
dotnet ef migrations has-pending-model-changes --project libs/infrastructure --startup-project apps/api
dotnet ef migrations script AddWordIpa AddWordPronunciation --project libs/infrastructure --startup-project apps/api
dotnet run --project tests/WordIpaChecks
dotnet run --project tests/WordPronunciationChecks
git diff --check
# apps/mobile
npx tsc --noEmit
npx expo lint
node --test tests/recent-words-controller.test.cjs
```

Optional live dictionary-only checks: `dotnet run --project tests/WordIpaChecks --
--live`. Dictionary contents can change; resilient previously returned audio with
no IPA, and curious included a truncated candidate before a complete one.

Persistence/worker checks require fresh, disposable PostgreSQL and Redis; never
use a development/production database. The checks apply migrations, insert fixture
words, and create the real enrichment groups. The older `IPA_TEST_DB` integration
mode has moved into `WordPronunciationChecks` to cover the independent consumers.
For example, with disposable services on ports 55442 and 55441:

```sh
PRONUNCIATION_TEST_DB='Host=127.0.0.1;Port=55442;Database=pronunciation_test;Username=postgres' PRONUNCIATION_TEST_REDIS=127.0.0.1:55441 dotnet run --project tests/WordPronunciationChecks
```

Manual review: start API/worker with shared storage, add an English word, confirm
201 returns immediately with null audio, and refresh GET /words after enrichment.
Open the returned relative audio path using the computer's LAN API origin. Confirm
missing files return 404 and null references, unavailable dictionary/configuration
leaves Add usable, and repeated GETs make no synthesis calls. Verify the Recent
Words icon is hidden before availability and appears after a successful refresh,
with no reserved empty control space. Playback remains intentionally unimplemented.
Issue #8 must add the focused rendered-UI conditional-icon test alongside playback.


## Swipe-to-delete vocabulary

Apply `AddWordDeletion` before restarting the API and worker together:

```sh
dotnet ef database update --project libs/infrastructure --startup-project apps/api
dotnet build VocaCycle.slnx
```

The migration adds nullable `DeletedAt` and makes spelling uniqueness apply only
to active vocabulary. It does not rewrite existing IPA, translations or sessions.
API and worker must share `VOCACYCLE_STORAGE`; the API now also needs permission
to unlink standalone files in its `pronunciations` directory. Session files are
never deleted. Do not downgrade this migration after re-adding an archived spelling
without resolving duplicate spellings first; the old unique index includes all rows.

Mobile uses the SDK-compatible `expo-sqlite` key/value store as a small deletion
journal. No paid/provider calls occur on Undo. One pending removal is allowed at a
time, preserving a full five-second Undo window. Other words can still be played,
scrolled and refreshed. Timers pause outside focused, foreground Home. If the app
closes, an expired operation is reconciled on the next foreground Home visit;
there is no promise that JavaScript timers run while iOS suspends/terminates it.

Backend regression checks create and drop their own disposable database and
fixture directory. The explicit admin connection must permit CREATE DATABASE;
no existing development data is migrated or deleted. HTTP providers are stubs,
and the isolated API receives an unusable Redis endpoint, never the live queue.

```sh
WORD_DELETE_TEST_ADMIN='Host=127.0.0.1;Database=postgres;Username=postgres' dotnet run --project tests/WordDeletionChecks
dotnet run --project tests/WordIpaChecks
dotnet run --project tests/WordPronunciationChecks
# apps/mobile
npx tsc --noEmit
npx expo lint
node --test tests/*.test.cjs
# repository root
git diff --check
```

Test swipe direction, vertical scroll arbitration, card/neighbor animation,
VoiceOver Delete/Undo, Reduce Motion, tab/background/force-close recovery,
playback and pull-to-refresh on a physical iPhone before merging. Use existing
fixture words/audio; no test requires triggering live ElevenLabs generation.
