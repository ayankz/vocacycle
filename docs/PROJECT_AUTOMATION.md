# GitHub Project issue synchronization

`.github/workflows/project-issue-sync.yml` synchronizes opened or edited issues to the existing user-owned `ayankz` Project named exactly `VocaCycle — MVP`. It can also synchronize one existing issue through **Actions → Sync issue to VocaCycle MVP → Run workflow**, using the `issue_number` input.

## Activation

1. Merge the workflow into the repository's default branch and ensure GitHub Actions is enabled.
2. Keep the existing repository Actions secret `VOCACYCLE_PROJECT_TOKEN`. Its credential must have read/write access to the user-owned Project and read access to this repository's issues. For a classic PAT, this means the `project` scope and, for a private repository, `repo`. Repository admin access alone does not grant the integration Projects access. Never paste the token into an issue, source file, or workflow log.
3. Ensure the existing Project has single-select fields `Status` with option `Todo` and `Priority` with option `Critical`, plus a number field `Estimate (hours)`. IDs are discovered dynamically; names must match exactly.
4. Once Issue #4 exists, manually dispatch with `issue_number` set to `4`. Inspect the run and confirm that there is one Project item with Status `Todo`, Priority `Critical`, and the expected estimate. Run again to check idempotency. This setup does not create Issue #4 or edit Issue #3.

## Behavior

The workflow reads the latest issue body and accepts one `## Estimate` section containing a nonnegative decimal, optionally followed by `hour`, `hours`, `hr`, `hrs`, or `h` (for example, `1.5 hours`). Missing, duplicated, or invalid sections produce a warning and preserve the current estimate. `Actual (hours)` is never changed.

Each synchronization sets Status to `Todo` and Priority to `Critical`, including edits to issues already in progress. These are fixed defaults, not values parsed from the body. Only Estimate is parsed.

The workflow paginates Project, field, and issue-membership discovery. It reuses existing items, serializes runs for each issue, and handles an Auto-add race without intentionally creating another item. API failures fail the run with an operation-specific error; a failed run can have partially updated fields, so correct the access/configuration problem and rerun. GitHub's automatic Project Auto-add can remain enabled.

`GITHUB_TOKEN` has no granted permissions (`permissions: {}`); API calls use only the dedicated secret. No checkout or application-code execution is needed. Issue text and manual input are treated as data, not interpolated into executable code.

## Validation

Local validation covered YAML structure, actionlint, JavaScript execution with mocked GraphQL responses, numeric and missing/invalid estimates, existing/new items, an Auto-add race, API failure, and preservation of Actual. Live execution with the repository Actions secret must be verified after merging; repository secrets cannot be retrieved for local testing.
