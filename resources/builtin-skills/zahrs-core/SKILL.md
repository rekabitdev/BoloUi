---
name: zahrs-core
description: Evidence-first software engineering workflow for planning, codebase mapping, debugging, implementation, research, security review, integration checking, and verification. Use for non-trivial coding tasks, bug investigation, architecture work, or when a result must be validated carefully.
---

# Zahrs Core

Use the smallest workflow that safely solves the task. Do not add phases, abstractions, services, or dependencies unless the request requires them.

## Core principles

1. Inspect before changing anything.
2. Separate observed facts from assumptions.
3. Find the root cause before implementing a fix.
4. Preserve existing behavior outside the requested scope.
5. Prefer the simplest implementation that satisfies the requirement.
6. Validate behavior with focused tests and direct runtime evidence.
7. Never claim success based only on code inspection.
8. Respect repository-specific instructions and safety boundaries.
9. Do not reveal hidden chain-of-thought. Provide concise findings, decisions, and evidence instead.

## Workflow selection

Choose only the relevant workflow:

- **Map**: unfamiliar repository, architecture, data flow, or integration.
- **Plan**: multi-step implementation where sequencing matters.
- **Debug**: error, regression, crash, hang, or unexpected behavior.
- **Execute**: implement a well-understood change.
- **Research**: compare technologies, repositories, or approaches.
- **Security review**: inspect permissions, trust boundaries, secrets, unsafe execution, or untrusted packages.
- **Verify**: prove acceptance criteria and integration behavior.

Do not run every workflow for a simple task.

## Map workflow

1. Read repository instructions.
2. Locate entry points and affected modules.
3. Trace data and control flow end to end.
4. Identify process or trust boundaries.
5. Record only findings relevant to the requested change.

Deliver: affected files, current behavior, constraints, and likely change points.

## Plan workflow

1. Restate the concrete outcome.
2. Identify dependencies and risks.
3. Split work into the fewest independently verifiable steps.
4. Define acceptance criteria from the user's request.
5. Avoid cleanup or redesign outside scope.

Deliver: concise ordered steps and verification for each step.

## Debug workflow

1. Capture the exact symptom and reproduction conditions.
2. Gather logs, state, and recent changes.
3. Form a small set of falsifiable hypotheses.
4. Test the highest-value hypothesis first.
5. Distinguish root cause from secondary symptoms.
6. Apply the narrowest fix.
7. Reproduce again and add a regression test where practical.

Avoid random edits, broad rewrites, and repeated retries without new evidence.

## Execute workflow

1. Read before editing.
2. Follow existing patterns and boundaries.
3. Keep the diff minimal.
4. Handle failure paths and preserve user data.
5. Add focused tests for changed behavior.
6. Run formatter, typecheck, lint, and relevant tests required by the repository.

## Research workflow

1. Prefer primary sources and source code.
2. Compare capability, runtime cost, dependencies, maintenance, security, and compatibility.
3. Separate verified facts from estimates.
4. Recommend the least complex option that meets the requirement.
5. State what should not be adopted and why.

## Security review

Check only relevant categories:

- arbitrary code execution;
- command or path injection;
- archive traversal;
- unsafe deserialization;
- credential or secret access;
- unrestricted network access;
- filesystem scope;
- browser permissions;
- dependency install scripts;
- privilege escalation;
- data exfiltration;
- missing user approval for sensitive actions.

Never execute untrusted scripts merely to inspect them. Prefer static inspection and isolated metadata reads.

## Integration checking

Verify that:

- producers and consumers agree on types and fields;
- persisted schema has a safe migration path;
- process boundaries use the intended bridge;
- IDs remain stable across reloads;
- deletion and rollback semantics are explicit;
- optional components fail gracefully;
- old data remains readable;
- configuration is read back after writing.

## Verification protocol

Use three levels where relevant:

1. **Existence** — expected file, schema, route, or artifact exists.
2. **Substance** — content and behavior match the requirement.
3. **Integration** — the feature works through the real user path.

Report checks run, checks passed, checks not run and why, and remaining limitations.

## Communication

Be concise and evidence-based. Do not produce mandatory trace-of-reasoning sections. Explain decisions and observable evidence without exposing private internal reasoning.
