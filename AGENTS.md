# VocaCycle agent instructions

VocaCycle is a mobile-first vocabulary listening app: ADD → GENERATE → LISTEN → REPEAT. Users save unfamiliar English words and generate continuous Audio Sessions for repeated listening. It does not manage external media.

## Before changing the project

- Read `README.md` and relevant documentation in `docs/` before significant changes: `PRODUCT.md` for scope, `ARCHITECTURE.md` for technical decisions, and `DEVELOPMENT.md` for workflow.
- Keep changes small, explicit, and reviewable. Keep documentation accurate when scope or decisions change.
- Current state is documentation only. Do not scaffold applications or install dependencies unless the task calls for it.

## Technical direction

- Mobile: React Native, Expo Development Builds, TypeScript, initially `expo-audio`.
- Backend: C#, ASP.NET Core Web API, Entity Framework Core, PostgreSQL; AWS is the cloud direction.
- Start with a modular monolith. Add infrastructure only for demonstrated requirements.
- Audio Sessions will use one continuous audio file plus timeline metadata. The generation pipeline is planned, not implemented.
- Do not select an LLM or TTS provider without an explicit decision. Eventually isolate external AI, TTS, and storage integrations behind clear interfaces.
- Follow the existing approved VocaCycle design system and screens. These designs will be transferred to Figma; do not invent a new visual system.

## Engineering and learning

- Prefer readable code and testable domain logic over clever abstractions or framework magic.
- Prefer standard C# and ASP.NET Core patterns when they are sufficient, so the codebase remains recognizable to .NET developers and employers.
- Do not introduce microservices, Redis, Kubernetes, RabbitMQ, CQRS, MediatR, event buses, or repository wrappers around EF Core without a demonstrated need.
- Do not implement future features prematurely or commit secrets.
- The developer knows React/Angular/TypeScript but is learning C#/.NET, AWS, and React Native. Explain important .NET decisions and briefly state trade-offs; avoid large unexplained architecture changes.
- After implementation, run appropriate available builds/tests and report results and any checks that could not run. Do not invent commands for applications that do not exist.
