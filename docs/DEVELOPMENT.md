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
