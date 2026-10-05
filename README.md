# VocaCycle

A mobile-first vocabulary listening application built around **ADD → GENERATE → LISTEN → REPEAT**.

Save unfamiliar English words encountered in everyday content, choose approximately 5–20 words, and generate a personalized Audio Session. Each word is followed by its translation and 5–7 natural English example sentences in one continuous recording for passive repeated listening.

## Planned stack

- **Mobile:** React Native, Expo Development Builds, TypeScript, `expo-audio`
- **API:** C#, ASP.NET Core Web API, Entity Framework Core
- **Database:** PostgreSQL
- **Cloud:** AWS
- **Generation:** LLM API, multilingual TTS API, FFmpeg; providers remain undecided

## Status

Repository foundation and documentation only. No applications, dependencies, audio pipeline, or cloud infrastructure have been implemented. Approved UI designs and a visual design system already exist and will be transferred to Figma before frontend implementation.

VocaCycle is a real product and a portfolio project focused on understandable engineering decisions, small vertical slices, and learning the stack without artificial complexity.

## Documentation

- [Product scope and workflow](docs/PRODUCT.md)
- [Architecture and future plans](docs/ARCHITECTURE.md)
- [Development approach](docs/DEVELOPMENT.md)
- [Coding-agent instructions](AGENTS.md)

Application code will eventually live in `apps/mobile/` and `apps/api/`. Infrastructure files will be added in `infrastructure/` when needed.
