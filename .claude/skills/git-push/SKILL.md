---
name: git-push
description: Review the current changes with the project code review, then commit them to a feature branch, push, and open a GitHub pull request into main.
disable-model-invocation: true
argument-hint: '[short description of the change]'
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git show *) Bash(git branch *) Bash(git fetch *) Bash(git remote *) Bash(git switch *) Bash(git add *) Bash(git commit *) Bash(npx tsc *) Bash(npm run check *) Bash(npm run format *)
---

# Review, commit, push, open a PR

Ship the current changes as a pull request into `main`. Go through the steps in order; when a step says to ask, stop and wait for the answer.

**No AI attribution anywhere:** commit messages, PR titles and PR bodies never mention Claude, Claude Code or AI —
no `Co-Authored-By: Claude` trailer, no "Generated with Claude Code" line, no session links.

## 1. Check the state

- Run `git status --short`, `git branch --show-current`, `git log --oneline main..HEAD`.
- Nothing uncommitted and no commits ahead of `main` → say there is nothing to ship and stop.
- Run `git fetch origin`. If `origin/main` has commits that local `main` doesn't, tell the user the PR may conflict.
  Don't pull, merge or rebase on your own.

## 2. Code review

Read `.claude/skills/code-review/SKILL.md` and perform that review on everything this PR will contain:
uncommitted changes plus commits of the current branch that are not in `main`.

- **`VERDICT: CHANGES REQUESTED`** → show the findings and ask the user to choose:
  - fix all findings, or only the listed numbers;
  - ship as is;
  - abort.

  After fixing: run `npm run format` and `npm run check`, re-review the files you touched, show a short summary of the fixes, and ask whether to continue to the PR.

- **`VERDICT: CLEAN`** → continue. Mention nits in one line, they don't block.

## 3. Describe the change

Decide from the diff (use `$ARGUMENTS` as the basis for the description if it's given):

| Type       | When                                            | Branch prefix |
| ---------- | ----------------------------------------------- | ------------- |
| `FEATURE`  | new gameplay, visuals or capability             | `feature/`    |
| `FIX`      | a bug fix                                       | `fix/`        |
| `REFACTOR` | restructuring without behavior change           | `refactor/`   |
| `DOCS`     | only docs: `README.md`, `CLAUDE.md`, `.claude/` | `docs/`       |
| `CHORE`    | dependencies, configs, tooling                  | `chore/`      |

- **Description**: English, imperative, lowercase, no trailing period, up to ~60 characters — `add cannon fire`, `fix ship stuck at island edge`.
- **Commit message and PR title**: `[TYPE]: description` — e.g. `[FEATURE]: add cannon fire`.
- **Branch**: `<prefix><description in kebab-case>`, 2–5 words — e.g. `feature/cannon-fire`, `fix/island-collision`.

If the changes mix unrelated things (a feature plus an unrelated refactor), propose splitting them into separate PRs and ask before continuing.
One PR is one logical change.

## 4. Branch

- On `main` → `git switch -c <branch>`; uncommitted changes move to the new branch.
- On another branch → keep it.
- Never commit or push to `main` directly.

## 5. Commit

- Stage explicitly by path with `git add <paths>` (deleted files included). Show the list of staged files.
- Never stage `.env*`, keys or other secrets, `dist/`, `node_modules/`, `*.local`, `.DS_Store`.
  If an untracked file looks unrelated or sensitive, ask.
- `package-lock.json`: stage it only if `package.json` changed too, or the user confirms.
- Commit with the message from step 3. For a non-trivial change add a body with 2–5 bullets.

## 6. Push and open the PR

- `git push -u origin <branch>`.
- If `gh` is installed and `gh auth status` succeeds:
  `gh pr create --base main --head <branch> --title "<commit message>" --body "<body>"`.
- Otherwise print the compare link `https://github.com/<owner>/<repo>/compare/main...<branch>?expand=1`
  (owner and repo from `git remote get-url origin`) together with the prepared title and body to paste,
  and mention that `brew install gh && gh auth login` enables automatic PRs.

PR body:

```markdown
## What

- <main changes, 2–5 bullets>

## Why

<one or two sentences>

## How to test

1. `npm run dev`
2. <what to do in the game and what to look at>

## Code review

<clean | findings fixed: … | shipped with known findings: …>
```

## 7. Report

Reply with the branch, the commit hash and message, and the PR link (or the compare link). Nothing else.
