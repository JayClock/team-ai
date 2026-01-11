---
description: Create git commit for staged changes
agent: build
model: zai-coding-plan/glm-4.7
---

Create a git commit following the project's commit conventions:

1. Run `git status`, `git diff`, and `git log -5` in parallel to understand:
  - Current staged and unstaged changes
  - Recent commit message style
  - Branch state
2. Analyze changes to determine:
  - Commit type (add/update/fix/refactor/docs/test)
  - Concise subject line (1-2 sentences)
  - Detailed body explaining the "why"

3. Stage all relevant files and create commit with message

Important:
- Follow existing commit message patterns from git log
- Never commit files with secrets (.env, credentials.json)
- Include all related changes in a single commit
- Do not amend unless user explicitly requested it
- Do not push unless user explicitly requested it

Return the commit hash and message created.
