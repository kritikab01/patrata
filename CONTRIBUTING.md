# Contributing

Thanks for your interest in Patrata. Ideas, bug reports and pull requests are welcome.

## Workflow

1. Open an [issue](https://github.com/kritikab01/patrata-app/issues/new/choose) first (bug or feature) so we agree on the change.
2. Create a branch from `main` named by type: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
3. Run the checks before pushing:
   ```bash
   npm run typecheck
   npm run build
   npm run lint
   ```
4. Open a pull request using the template. Netlify builds a preview link for every PR.
5. `main` is always deployable; it deploys to production automatically.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat: add Tamil`, `fix: tenure default for vehicle loans`, `docs: update PRD metrics`.

## Ground rules for AI features

- The LLM must never make or change a decision.
- Never send names, IDs or contact details to any AI provider.
- Any new number shown in AI text must come from the engine.
