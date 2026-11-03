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

### Dictionary IPA and pronunciation enrichment (Issues #19 and #20)

`POST /words` still saves before its bounded best-effort Redis publish. New events
include `pronunciation=1` alongside `wordId` on `vocacycle:translation:jobs`.
The existing worker process runs a `PronunciationWorker` in a separate
`pronunciation-workers` group on that same stream. `TranslationWorker` now owns
translation alone. Separate groups prevent slow audio work, dictionary failures,
or translation failures from consuming another operation's retries. No additional
Redis deployment, worker project, or job framework is introduced.

Both groups start at `0-0`, reclaim after 60 seconds, and acknowledge after at most
three deliveries. Pronunciation ignores historical messages without the marker,
preventing an automatic paid backfill on deployment. Its per-delivery deadline is
40 seconds, below the reclaim interval. Dictionary attempts have a five-second
whole-response deadline and 1 MiB cap; approved downloads have ten seconds and a
2 MiB cap. Provider failures never fail Add. Publication remains non-atomic with
PostgreSQL; the existing missed-publication limitation still applies.

`DictionaryIpaClient.LookupPronunciationAsync` reads IPA and recording metadata
from one response. Existing IPA selection/validation is preserved. The chosen
recording is the ordinally first eligible URL. Only HTTPS, default-port URLs in
`api.dictionaryapi.dev/media/pronunciations/en/` ending in `-us.mp3` are eligible;
this specific provider namespace's US suffix is the accent evidence. Generic
English recordings, UK suffixes, and arbitrary hosts/filenames are not evidence of
American English. Downloads disable redirects/cookies and revalidate the URL.
Clients cannot supply a download URL. MIME type, MP3 signature, and bounded bytes
are checked before an atomic filesystem write.

Licensing is recording-specific. The API's free availability and GPL source-code
license do not license all linked recordings. Its audio metadata includes
`sourceUrl` and sometimes a per-recording license; it does not supply creator
attribution. This slice accepts only explicit CC0 1.0 with an HTTPS Wikimedia
Commons source link. CC BY/BY-SA recordings are conservatively ineligible because
complete attribution is unavailable in the response. They are neither copied nor
exposed as permanent remote URLs. Supporting them later requires source-level
rights verification and attribution presentation. CC0 source/license metadata is
retained in the internal dictionary checkpoint. This is a deliberately narrow
policy, not a claim that other recordings forbid reuse.

A 404 or successful parsed response without an eligible recording confirms
absence under that policy and permits ElevenLabs fallback. 429, 5xx, malformed
responses, timeouts and network errors do not. A failed eligible-recording download
never switches to paid synthesis. IPA is saved before audio processing, including
when audio storage or TTS configuration is missing. A durable internal
`DictionaryPronunciation` JSON checkpoint caches confirmed absence or the chosen
recording, so audio retries never repeat completed IPA/dictionary work. Conditional
updates preserve concurrently written IPA and translation.

ElevenLabs receives only a single saved English word (letters with optional
internal apostrophes/hyphens, at most 80 characters), never examples, definitions,
or translations. Voice/model/output/timeout/key are worker configuration. The
operator must verify the selected voice's American accent and explicitly set
`VoiceAccent=en-US`; language code `en` alone makes no accent guarantee. Missing or
invalid configuration logs a safe diagnostic and leaves audio null. No voice or
model is silently selected. Authentication/quota failures and transient rate/server
failures have safe distinct categories; raw provider bodies/keys are never logged.

The documented synthesis endpoint provides no idempotency parameter. A conditional
PostgreSQL update sets `PronunciationSynthesisAttempted` **before** the HTTP request;
only the winning delivery may send it. At most one automatic paid attempt is made
per word, even with concurrent deliveries, timeouts, cancellation, crashes, empty
responses, or 5xx. This trades automatic recovery for cost control: a crash between
the claim and send may leave audio absent without spending anything. Even explicit
rate-limit rejection is not automatically retried in this conservative slice.
Dictionary requests/downloads retain the bounded stream retries (60-second backoff).
Administrators must inspect provider history/billing and local artifacts before
manually authorizing another synthesis attempt. Do not routinely clear claims.

Audio uses the existing shared `VOCACYCLE_STORAGE` filesystem, in
`pronunciations/word-{id}.mp3`; no audio bytes go into PostgreSQL. Atomic temporary
writes prevent partial files being served. A finished file can recover a crash
before its DB reference update without calling a provider again. The nullable
`Word.PronunciationAudioUrl` is `/words/{id}/pronunciation`, served by a range-enabled
backend endpoint. GET /words omits references to missing files. Internal dictionary
and synthesis checkpoints are JSON-ignored. API and worker must share storage.
The relative URL resolves against the mobile API's LAN origin, with no hardcoded
localhost host. GET does not enqueue work; existing recordings are reused. Missing
paid-generated files are not automatically regenerated after a claim.

Recent Words maps `pronunciationAudioUrl` and renders its existing play control
only for a nonempty reference, removing control spacing when hidden. Refresh can
reveal completed audio; the existing translation/IPA polling budget is unchanged.
Playback and its loading/playing/error states remain Issue #8. That issue must add
a focused rendered-UI test for null/undefined/empty URLs versus an available URL.

References checked for this implementation:

- [Free Dictionary API documentation](https://dictionaryapi.dev/)
- [Actual apple metadata](https://api.dictionaryapi.dev/api/v2/entries/en/apple)
- [API source repository](https://github.com/meetDeveloper/freeDictionaryAPI)
- [CC0 rights and limitations](https://creativecommons.org/publicdomain/zero/1.0/)
- [CC BY-SA attribution requirements](https://creativecommons.org/licenses/by-sa/3.0/)
- [ElevenLabs synthesis contract](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
- [ElevenLabs rate-limit diagnostics](https://elevenlabs.io/docs/help-center/technical/api-error-code-429)

### Home data contracts (Issue #10)

Home reuses `GET /words` for Recent Words, the Create Audio CTA and the saved-word
statistic. Quick Add, Delete/Undo, focus and pull-to-refresh keep that data current.
The remaining session contracts are unavailable:

- **Session listing and counts:** `POST /audio-sessions` creates a session and
  `GET /audio-sessions/{id}` reads a known session. There is no collection/latest
  session response or authoritative count of completed, playable sessions.
- **Playable session and timeline:** the session response has no continuous audio
  URL, duration or timeline mapping playback time to words/examples. Standalone
  `/words/{id}/pronunciation` audio is not a playable Audio Session.
- **Listening activity:** no persisted playback position, resumable/completed state
  or recorded listening minutes exist. `AudioSessionWord.Position` is word order,
  not playback progress; session duration cannot substitute for time listened.

Consequently, Home omits Continue Listening entirely: it cannot identify a real
resumable session. Sessions and Listened display `—` (unavailable), not fabricated
zeroes. Saved words show the real count, including confirmed `0`; `…` means initial
loading, and failed refreshes retain a known count marked stale. An unknown count
after a failed first load remains unavailable.

Related work: [Home Data Integration #10](https://github.com/ayankz/vocacycle/issues/10),
[Continue Listening #5](https://github.com/ayankz/vocacycle/issues/5),
[Home Statistics #9](https://github.com/ayankz/vocacycle/issues/9) and
[Create Audio configuration #30](https://github.com/ayankz/vocacycle/issues/30).
These links identify related scope; session listing/counts, playable metadata and
listening persistence still require separately scoped contract work. This Home
integration does not introduce endpoints, analytics or a player.

### Vocabulary discovery (Issue #35)

`GET /words` adds `createdAt` and `hasAudioSession` to existing active-word fields.
Membership is an `EXISTS` query against `AudioSessionWords` in the same database
query: any session membership counts, including pending, failed and cancelled
jobs. "Not in Audio" means never included, not "no playable recording"; word
pronunciation URLs do not establish membership. Re-adding a deleted spelling gets
a new ID and does not inherit the archived word's membership.

Apply `AddWordCreatedAt` before starting the updated API/worker. New words record
UTC creation time; existing rows retain null because their original dates are
unknown. Recent sorts dated words newest first, then legacy words by descending
ID, with ID also breaking date ties. It includes all active words without an
invented time window. All preserves existing list order. Search matches word or
translation case-insensitively within each filter; chip counts reflect all active
words before search. Select All/Deselect All affects visible results and preserves
selections outside the search/filter; Continue validates against all active words.

Validation: `dotnet build VocaCycle.slnx`, migration/model check, existing
`WordDeletionChecks` against its disposable database, and mobile tests. No worker
or paid provider is invoked by discovery queries or these checks.

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


### Removing vocabulary

DELETE /words/{id} is idempotent and marks a word deleted rather than breaking
AudioSessionWord foreign keys. Word, translation, IPA and example history remain
for existing sessions; active vocabulary queries use an EF global query filter.
Session reads/workers explicitly include archived words. A partial unique index
allows saving the same spelling again with a new ID. Existing session files remain.

DELETE and final pronunciation publication share a short PostgreSQL row lock.
Provider calls happen outside the lock. Deleted words are excluded from new
translation/dictionary/TTS claims; a provider request already in flight can finish,
but final publication rechecks the tombstone and discards its result. Retained
Redis events are acknowledged by existing missing-word handling, without deleting
shared stream entries or disturbing translation/session consumers.

Standalone pronunciation cleanup is inside the deletion transaction. Filesystem
failure rolls back the marker and returns an error. PostgreSQL and filesystem
changes are not jointly transactional: a crash/commit failure after unlinking can
leave a still-visible word without standalone audio; existing paid-attempt claims
are never reset. This does not affect generated session files or permit paid retry.
