# MCP Server for Stack Visibility

Goal: give coding agents a clear view of what is running, where, and how to interact with it.

## Core Idea
Expose a small, safe MCP surface that lists services, streams logs, and runs explicit scripts with context.

## Benefits
- One place to see the whole stack (local, docker, k8s, ssh)
- Fast log access without manual attaching
- Consistent, scriptable ops for agents and humans
- Safer automation with clear scopes and prompts

## Minimal Tool Set
- `list_runnables`: services, status, cwd/context
- `get_logs` / `stream_logs`: tail or stream by service
- `list_scripts`: resolved scripts with descriptions and contexts
- `run_script`: explicit execution with guardrails
- `describe_contexts`: k8s/docker/ssh attach details

## Metadata for LLMs
Allow optional descriptions per runnable/context/script:
- purpose, owner, risk level, dependencies, data sensitivity
