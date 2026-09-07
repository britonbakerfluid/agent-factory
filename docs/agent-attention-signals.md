# Agent attention signals

The shared session now carries optional `attention: { kind, since }`. It is evidence about a turn, separate from where the avatar is walking or sitting. `since` is the server timestamp of the uninterrupted state; repeated hooks do not restart it. Existing world snapshots, deltas, and the JSON world checkpoint carry the value, so a newly connected viewer does not need to have witnessed an earlier bubble.

| Evidence received | Attention | Clear or replace it when |
| --- | --- | --- |
| `PermissionRequest` | `permission` | Prompt, ordinary tool use, successful tool completion, or other resumed work |
| `PreToolUse` for `AskUserQuestion` / Codex `request_user_input`, or `Elicitation` | `input` | Answer/result or resumed work |
| `PreToolUse` for `ExitPlanMode` | `permission` | Successful `PostToolUse` or resumed work |
| `Stop` after working | `ready` | Resumed work; an existing unanswered request remains pending instead |
| `PostToolUseFailure` or `StopFailure` | `error` | Recovery or a later completed turn |

`ready` means the agent finished a turn. It does not claim that the user must answer a question. `error` means a failure was observed, not that the agent cannot recover by itself. Generic notifications, elapsed time, idle roaming, and an older host's unspecified `waiting` activity never establish an input request. Subagent completion and informational events do not answer a parent's pending question.

The [Claude Code hook reference](https://code.claude.com/docs/en/hooks) describes `ExitPlanMode` as asking for plan approval and `PostToolUse` as successful completion. The old server set waiting *after* that successful completion; this update moves approval to the pending tool phase and clears it after success.

A session reconnect preserves valid attention and its original timestamp. Session end clears it; stale-session removal removes the agent. A restored snapshot discards malformed attention or a state that contradicts its activity. A snapshot without attention remains compatible and does not manufacture completion/input evidence.

## Hook coverage and privacy

The current Go CLI's Claude installer already registers the needed permission, elicitation, and failure events. The Codex installer currently registers `SessionStart`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, and `Stop`; it can only report attention evidenced by those events and exact supported tool names. The older shell installers register a smaller event set and cannot show signals they never send. This change does not rewrite local hook configuration or expand those installers.

For Codex, exact `request_user_input` receives input attention until its result arrives. The [0.145.0 request handler](https://github.com/openai/codex/blob/rust-v0.145.0/codex-rs/core/src/tools/handlers/request_user_input.rs) awaits the response, and the [same release's default tool hook path](https://github.com/openai/codex/blob/rust-v0.145.0/codex-rs/core/src/tools/registry.rs) emits its canonical function name. This matches the installed CLI version checked during implementation. It does not establish what a different desktop host emits.

The [current Codex hook coverage](https://learn.chatgpt.com/docs/hooks#tool-coverage) reports shell and `exec_command` as `Bash` (already `running`) and file patches as `apply_patch` (now `writing`). Hosted web search has no hook coverage, so this update cannot derive a searching state for that path. No `functions.` aliases or MCP tool names are guessed: in particular, `request_user_input_async` returning does not establish a blocked agent or an unanswered question.

Codex's [0.145.0 hook runtime](https://github.com/openai/codex/blob/rust-v0.145.0/codex-rs/core/src/hook_runtime.rs) attaches `agent_id` only for thread-spawned children on ordinary work hooks. These tagged events update the matching child's activity, not the parent's activity, identity, tool count, route, bubbles, or attention. Unknown children are ignored until a supported child-start event establishes them. A child's Stop does not make its parent ready. The existing Codex installer does not register `SubagentStart`/`SubagentStop`, so it may lack child registrations; ignoring those unknown children protects parent state without manufacturing extra agents.

Only existing event names and tool names are needed. Hook allowlists and server normalization remain unchanged: the new feature does not send raw questions, plans, prompts, tool input, or tool output. Attention is assigned by the server; a caller-supplied attention object is discarded by the existing ingest boundary.

## Validation

`tests/agent-attention.test.ts` exercises requests, approval completion, answered questions, errors/recovery, repeated hooks, short/long reconnects, old and malformed snapshots, session removal, privacy, and a database round trip into a fresh server/viewer snapshot. The focused hook-redaction, world-state, and persistence suites remain part of the verification.
