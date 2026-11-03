# VocaCycle

A mobile-first vocabulary listening application built around **ADD → GENERATE → LISTEN → REPEAT**.

Save unfamiliar English words encountered in everyday content, choose approximately 5–20 words, and generate a personalized Audio Session. Each English–Russian pair plays English → 2-second pause → Russian → 2-second pause → Russian → 2-second pause → English, in one continuous recording for repeated listening.

## Planned stack

- **Mobile:** React Native, Expo Development Builds, TypeScript, `expo-audio`
- **API:** C#, ASP.NET Core Web API, Entity Framework Core
- **Database:** PostgreSQL
- **Cloud:** AWS
- **Generation:** stored English–Russian pairs, cached ElevenLabs multilingual speech, FFmpeg

## Status

The repository includes the Expo mobile app, ASP.NET Core API, PostgreSQL persistence and Redis worker. Vocabulary and full Audio Session generation are implemented locally; provider configuration, migrations and FFmpeg setup are described in docs/DEVELOPMENT.md. Cloud deployment and listening-history persistence remain future work.

VocaCycle is a real product and a portfolio project focused on understandable engineering decisions, small vertical slices, and learning the stack without artificial complexity.

## Documentation

- [Product scope and workflow](docs/PRODUCT.md)
- [Architecture and future plans](docs/ARCHITECTURE.md)
- [Development approach](docs/DEVELOPMENT.md)
- [Coding-agent instructions](AGENTS.md)

Application code will eventually live in `apps/mobile/` and `apps/api/`. Infrastructure files will be added in `infrastructure/` when needed.
