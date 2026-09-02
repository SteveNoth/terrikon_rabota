/**
 * Ставит git hook pre-commit: check:design и check:budget.
 * Без husky — один файл в .git/hooks, ничего не пишем в git config.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const gitPath = path.join(root, ".git");
if (!fs.existsSync(gitPath)) {
  process.exit(0);
}

let gitDir = gitPath;
if (fs.statSync(gitPath).isFile()) {
  const text = fs.readFileSync(gitPath, "utf8");
  const match = /^gitdir:\s*(.+)$/m.exec(text);
  if (match) {
    gitDir = path.resolve(root, match[1].trim());
  }
}

const hooksDir = path.join(gitDir, "hooks");
fs.mkdirSync(hooksDir, { recursive: true });

const hookSrc = path.join(root, "scripts", "git-hooks", "pre-commit");
if (!fs.existsSync(hookSrc)) {
  process.exit(0);
}
fs.copyFileSync(hookSrc, path.join(hooksDir, "pre-commit"));
try {
  fs.chmodSync(path.join(hooksDir, "pre-commit"), 0o755);
} catch {
  /* Windows: git и так выполнит hook */
}
