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
