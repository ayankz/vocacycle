# Architecture

## Current / initial architecture

### Current repository state

The repository includes an Expo mobile app, ASP.NET Core API, EF Core/PostgreSQL persistence, and an existing Redis-backed audio worker. Word translation is implemented as an independent consumer in the same worker process. Cloud deployment remains future work.

### Word translation (Issue #18)

`POST /words` saves first, then makes a best-effort bounded publish of `wordId` to
`vocacycle:translation:jobs`. Redis failure is logged and does not change the 201
response. Existing API contracts and the nullable `Word.Translation` field remain
unchanged. Add does not generate examples.

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
counts bound processing to three deliveries across restarts. Successful, invalid,
or exhausted jobs are acknowledged. Acknowledged entries remain in the stream;
retention is not automated. Existing translations are skipped, and conditional
updates preserve a translation written concurrently.

Home refreshes Recent Words on every focus and after Add. Only words added during
the current mounted Home lifetime receive polling budgets. One shared timer polls
`GET /words` two seconds after the preceding request settles, up to five attempts
per waiting word. Network failures and eight-second request timeouts count toward
the budget. A successful translation removes its word from polling; exhausted
words display `Translation unavailable`. Blur/unmount clears the timer and aborts
the request. Returning Home refreshes immediately and resumes remaining budgets,
without resetting exhausted ones. Lists remain visible during background requests.

Trade-off: database persistence and Redis publication are not atomic. Redis outage
or a crash between save and publish can leave a word untranslated. No outbox,
automatic backfill, or schema change is introduced in this slice. The mobile
unavailable label means its waiting budget ended, not a durable backend status;
translation may appear on a later focus refresh.

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
