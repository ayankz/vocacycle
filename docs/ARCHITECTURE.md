# Architecture

## Current / initial architecture

### Current repository state

Only project documentation and repository conventions exist. No mobile app, API, database schema, external integration, or deployed infrastructure exists yet.

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

This is a conceptual pipeline, not an implemented service design. Translation sourcing and provider choices remain open. External AI, TTS, and storage providers will be isolated behind focused interfaces when integrations are added.

### Playback and infrastructure evolution

The player will use `expo-audio` initially. Background playback, lock-screen controls, playback speed, ±15-second seeking, repeat, and timeline synchronization will be implemented and verified in Expo Development Builds. Offline/local caching comes later.

Amazon S3, a queue, a .NET background worker, Docker, GitHub Actions, Terraform, a CDN, and observability may be introduced when actual requirements justify them. None is provisioned or required by this foundation. Generation execution, storage, authentication, deployment topology, and retry behavior require future decisions.

Do not add Redis, Kubernetes, RabbitMQ, CQRS, MediatR, event buses, or microservices for sophistication. Prefer the smallest understandable solution that meets the demonstrated requirement.
