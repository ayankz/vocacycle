# Codex two-agent lab (safe first experiment)

This pilot coordinates **two independent Codex sessions** from a GitHub Issue:
Planner → QA → combined comment on the Issue. It does not edit code, open PRs, deploy, or automatically merge.

## One-time setup

1. Open the draft pull request for this lab, review it and merge it when ready.
2. Open **Settings → Secrets and variables → Actions → New repository secret**.
   Create `OPENAI_API_KEY` with an **OpenAI API Platform** key (not a ChatGPT subscription token).
   **API usage is billed separately** from ChatGPT Plus and may incur costs.
3. Optionally set a small OpenAI Platform budget/usage alert before triggering jobs.
4. Confirm GitHub Actions is enabled in the repository and the workflow may post issue comments.
5. Create a repository label named `ai:ready`. Use it only for issues intentionally approved for an AI run.

## First run

1. Create a small real GitHub Issue describing a bounded analysis task.
2. Add that Issue to your VocaCycle GitHub Project.
3. Apply the `ai:ready` **label to the Issue** (not a Project custom field).
4. Open **Actions → Codex two-agent lab** to watch Planner, QA and Report jobs.
5. Look for one combined comment on the issue containing both agents' outputs.
6. Remove the `ai:ready` label after the test to avoid accidental re-runs.

Alternative: open **Actions → Codex two-agent lab → Run workflow** and enter an existing Issue number. This does not require adding a label.

## Important limits

- Dragging a card between **GitHub Projects Status** columns is **not** this trigger. Project-item events are not ordinary repository Actions triggers. For drag-to-start, we would need a separate GitHub App webhook or polling bridge.
- This first stage uses two **read-only** Codex runs with different roles; no separate permissions for editing tests versus application code are needed yet.
- Later stages can add a test-writing agent, a coding agent with constrained diffs, a PR reviewer and branch-protected CI. Do not let an AI agent deploy or merge directly before these guardrails are established.
- Both agent jobs use the OpenAI Codex GitHub Action and need a repository API key. GitHub Actions usage and OpenAI API usage have their own limits and charges.
- The QA agent inspects the Planner output and repository in an independent runner. A separate report job posts the final GitHub Issue comment without the OpenAI API key.
- The workflow intentionally does not update the GitHub Projects Status field. GitHub's built-in project automations can set **Done** when a linked Issue closes.

## Safety

The AI jobs use a read-only permission profile, repository content read permission and no persisted checkout credentials. The report job alone gets `issues: write`. Keep secrets out of issue bodies, and review any suggested changes yourself.

## Next stage (not included yet)

Add coding with distinct jobs and artifact handoffs; validate which files each agent can change; run deterministic tests in GitHub Actions; open a draft PR; require protected-branch checks before merging. Add Project Status synchronization only after the two-agent run succeeds.
