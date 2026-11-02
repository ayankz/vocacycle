# Architecture

## Current / initial architecture

### Current repository state

The repository includes an Expo mobile app, ASP.NET Core API, EF Core/PostgreSQL persistence, and an existing Redis-backed audio worker. Word translation is implemented as an independent consumer in the same worker process. Cloud deployment remains future work.

### Word translation (Issue #18)

`POST /words` saves first, then makes a best-effort bounded publish of `wordId` to
`vocacycle:translation:jobs`. Redis failure is logged and does not change the 201
response. Word responses expose nullable `translation` and `ipa` fields. Add does not generate examples.

The existing worker host runs an independent `TranslationWorker` alongside its
unchanged audio consumer. Its `translation-workers` group is created automatically
at `0-0` to consume jobs queued before startup. `IWordTranslator` selects a provider
using worker configuration `Translation:Provider`: by default Ollama in Development
and Google in Production (and other environments). Explicit values override the
default; unknown values fail startup, and provider errors never cause fallback.

Production uses Google Cloud Translation Basic v2 with explicit `en` → `ru` and
plain text. The API key stays in worker configuration and is sent in a redacted
`x-goog-api-key` header, never in URLs or mobile configuration. Development uses
the existing named Ollama HTTP client and `qwen3:1.7b`, with thinking disabled,
temperature zero, a fixed seed, and a 64-token output cap. A JSON schema requests
one translation field. Completed output must contain exactly that field with a
short Russian phrase (1–4 words, at most 64 characters); empty output, additional
fields, markup, prose and common explanatory prefixes are rejected before saving.
Structural validation does not guarantee translation quality from the small model.

Google HTTP attempts time out after 5 seconds. Ollama reuses its existing HTTP
configuration; both providers retain the worker's 15-second processing bound.
Failures remain pending and can be reclaimed after 60 seconds. Redis delivery
counts bound processing to three deliveries across restarts. Completed, invalid,
or exhausted jobs are acknowledged. Acknowledged entries remain in the stream;
retention is not automated. Existing translations are skipped, and conditional
updates preserve a translation written concurrently.

Home refreshes Recent Words on every focus and after Add. Only words added during
the current mounted Home lifetime receive polling budgets. One shared timer polls
`GET /words` two seconds after the preceding request settles, up to five attempts
per waiting word. Network failures and eight-second request timeouts count toward
the budget. A word with both translation and IPA leaves polling; exhausted
words display `Translation unavailable`. Blur/unmount clears the timer and aborts
the request. Returning Home refreshes immediately and resumes remaining budgets,
without resetting exhausted ones. Lists remain visible during background requests.

Trade-off: database persistence and Redis publication are not atomic. Redis outage
or a crash between save and publish can leave a word untranslated. No outbox,
automatic backfill, or schema change is introduced in this slice. The mobile
unavailable label means its waiting budget ended, not a durable backend status;
translation may appear on a later focus refresh.

### Dictionary IPA enrichment (Issue #19)

The existing `TranslationWorker` now enriches both translation and IPA on the same
stream, group, and delivery. Add enqueues even when a translation was supplied,
because IPA is still missing. There is no new queue, hosted service, or provider
for generated IPA. The typed `DictionaryIpaClient` calls Free Dictionary API with
an encoded English word and a five-second HTTP timeout, without credentials.

Each delivery attempts translation and IPA sequentially with independent failure
boundaries, database contexts, and 15-second processing deadlines. A translation
timeout cannot consume IPA's deadline. Either transient failure leaves the message
pending until the existing 60-second reclaim and three-delivery limit. Persisted
nonempty fields skip their providers. Each conditional SQL update touches only its
own empty field, preserving concurrent writes and safely ignoring deleted words.
Shutdown cancellation leaves the delivery pending.

IPA selection prefers valid `phonetics[].text`, then entry-level `phonetic`.
Delimited candidates take priority within each source; response order breaks ties.
The parser preserves notation, rejects markup, URLs, mismatched delimiters,
truncated hyphen forms and unsupported characters. This is conservative structural
validation, not a phonology engine. 404 and successful responses without suitable
IPA complete the lookup with null; malformed JSON, HTTP errors, network errors and
timeouts use the delivery retry. No definitions, examples, or audio are consumed.

Trade-off: no durable IPA completion/status field is added. A dictionary miss may
be queried again if translation fails on the same job (at most three deliveries).
No backfill is added for historical words or failed best-effort publication. A saved
nonempty IPA is preserved even if it predates this parser's validation rules.

Home shares the existing five-attempt per-new-word polling budget across both
fields, continuing when translation arrives before IPA or vice versa. Translation
loading labels depend on translation alone. Missing IPA has no placeholder. Polls
stop when both values arrive or the budget ends, including dictionary misses. A
later focus refresh can still discover backend retries completed after that window.
IPA appears below English text using existing secondary typography and wraps with
the available card width. Audio playback and example generation are unchanged.

### Chosen technical direction

| Area | Decision |
| --- | --- |
| Mobile | React Native, Expo, Expo Development Builds, TypeScript |
| Initial audio library | `expo-audio` |
| Backend | C#, ASP.NET Core Web API |
| Persistence | Entity Framework Core with PostgreSQL |
| Cloud direction | AWS |
| Example generation | LLM API; provider undecided |
| Speech generation | Multilingual TTS API; provider undecided |
| Audio processing | FFmpeg |

The initial implementation will be a mobile client calling one ASP.NET Core API, with the API using EF Core to access PostgreSQL. The backend will begin as a modular monolith: one backend application with clear responsibilities and testable business logic, not independently deployed microservices.

Use straightforward EF Core access without repository wrappers unless a concrete need emerges. Do not pre-create layers, projects, or generic abstractions merely to resemble an enterprise architecture.

### Repository layout

Current documentation lives in `docs/`, with persistent agent guidance in root `AGENTS.md`. When applications are scaffolded, use `apps/mobile/` and `apps/api/`. Add `infrastructure/` only when real infrastructure files are needed. These future directories are intentionally absent today.

## Planned / future architecture

### Audio Session model

A completed Audio Session will be represented by one continuous audio file and corresponding timeline metadata, conceptually:

```text
session.mp3
timeline.json
```

The timeline will map playback time to the current word, translation, example sentence, word position, and example position. Audio and metadata must describe the same generated session. Exact schemas, timing units, storage locations, and API contracts will be decided during implementation.

### Generation pipeline

1. Accept the selected saved words, typically 5–20.
2. Obtain the word translation and generate 5–7 natural English example sentences per word. The exact translation source and language-generation provider will be decided during implementation.
3. Produce speech with a multilingual TTS integration.
4. Process and assemble speech into a continuous recording with FFmpeg.
5. Produce matching timeline metadata and make the completed session available to the mobile player.

This is a conceptual pipeline, not an implemented service design. Word translation uses Google Cloud Translation Basic v2 in Production and Ollama in Development (English to Russian); other provider decisions remain open. External AI, TTS, and storage providers will be isolated behind focused interfaces when integrations are added.

### Playback and infrastructure evolution

The player will use `expo-audio` initially. Background playback, lock-screen controls, playback speed, ±15-second seeking, repeat, and timeline synchronization will be implemented and verified in Expo Development Builds. Offline/local caching comes later.

Amazon S3, a queue, a .NET background worker, Docker, GitHub Actions, Terraform, a CDN, and observability may be introduced when actual requirements justify them. None is provisioned or required by this foundation. Generation execution, storage, authentication, deployment topology, and retry behavior require future decisions.

Do not add Redis, Kubernetes, RabbitMQ, CQRS, MediatR, event buses, or microservices for sophistication. Prefer the smallest understandable solution that meets the demonstrated requirement.
