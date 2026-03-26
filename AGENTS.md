# AGENTS.md

This file defines guidance for AI coding agents working in this repository.

## Scope
- This file applies to the entire repository unless a deeper `AGENTS.md` overrides it.

## Project quick context
- Front-end: React app under `src/`.
- Serverless API routes: `api/`.
- Docs and handovers: `docs/`.

## Working rules
- Keep changes focused and minimal for the requested task.
- Prefer small, readable functions over large rewrites.
- Preserve existing naming and file organization patterns.
- Do not introduce new dependencies unless required.

## Validation
- Run targeted checks for the files you touched first.
- If available, run the project test/lint/build commands before finalizing.

## Documentation
- Update documentation when behavior or developer workflow changes.
- Add short notes in `docs/` for any non-obvious decisions.

## Safety
- Never commit secrets or tokens.
- Avoid destructive data operations unless explicitly requested.
