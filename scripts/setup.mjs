#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Interactive first-time setup.
 * Creates .env.local by prompting for the few values you actually need.
 * Re-running is safe — existing values are shown as defaults.
 */
import { readFile, writeFile, access } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ENV_PATH = join(ROOT, ".env.local");
const EXAMPLE_PATH = join(ROOT, ".env.example");

const rl = createInterface({ input: stdin, output: stdout });

const colors = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function ask(label, { current, placeholder, required = true }) {
  const hint = current
    ? ` ${colors.dim(`[${current.length > 24 ? current.slice(0, 8) + "…" + current.slice(-4) : current}]`)}`
    : placeholder
      ? ` ${colors.dim(`(e.g. ${placeholder})`)}`
      : "";
  const answer = (await rl.question(`${colors.cyan(label)}${hint}: `)).trim();
  if (!answer && current) return current;
  if (!answer && required) {
    console.log(colors.yellow("  required — try again"));
    return ask(label, { current, placeholder, required });
  }
  return answer;
}

async function main() {
  console.log();
  console.log(colors.bold("Exam Analyzer setup"));
  console.log(colors.dim("Press enter to keep existing values shown in brackets."));
  console.log();

  const existing = (await exists(ENV_PATH))
    ? parseEnv(await readFile(ENV_PATH, "utf8"))
    : {};

  console.log(colors.bold("1. Supabase"));
  console.log(
    colors.dim(
      "   Dashboard → Project Settings → API. Copy the URL, anon key, and service_role key.",
    ),
  );
  const SUPA_URL = await ask("Supabase URL", {
    current: existing.NEXT_PUBLIC_SUPABASE_URL,
    placeholder: "https://xxxx.supabase.co",
  });
  const SUPA_ANON = await ask("Supabase anon key", {
    current: existing.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  const SUPA_SERVICE = await ask("Supabase service_role key", {
    current: existing.SUPABASE_SERVICE_ROLE_KEY,
  });

  console.log();
  console.log(colors.bold("2. Anthropic"));
  console.log(colors.dim("   https://console.anthropic.com → API Keys."));
  const ANTHROPIC = await ask("Anthropic API key", {
    current: existing.ANTHROPIC_API_KEY,
    placeholder: "sk-ant-…",
  });

  console.log();
  console.log(colors.bold("3. Allowlist (personal use)"));
  console.log(
    colors.dim("   The only email(s) allowed to sign in. Usually just yours."),
  );
  const ALLOWED = await ask("Your email", {
    current: existing.ALLOWED_EMAILS,
    placeholder: "you@example.com",
  });

  const site =
    existing.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const template = await readFile(EXAMPLE_PATH, "utf8");
  // Replace values in the template so we preserve its comments.
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: SUPA_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPA_ANON,
    SUPABASE_SERVICE_ROLE_KEY: SUPA_SERVICE,
    ANTHROPIC_API_KEY: ANTHROPIC,
    ANTHROPIC_MODEL_OCR:
      existing.ANTHROPIC_MODEL_OCR || "claude-sonnet-4-6",
    ANTHROPIC_MODEL_GRADING:
      existing.ANTHROPIC_MODEL_GRADING || "claude-opus-4-7",
    ALLOWED_EMAILS: ALLOWED,
    NEXT_PUBLIC_SITE_URL: site,
  };
  let next = template;
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    if (re.test(next)) next = next.replace(re, `${k}=${v}`);
    else next += `\n${k}=${v}`;
  }

  await writeFile(ENV_PATH, next, "utf8");

  console.log();
  console.log(colors.green("✓ Wrote .env.local"));
  console.log();
  console.log(colors.bold("Next steps:"));
  console.log(
    "  1. Open " +
      colors.cyan(`${SUPA_URL}/project/_/sql/new`) +
      " and paste the contents of",
  );
  console.log("     " + colors.cyan("supabase/migrations/0001_init.sql") + ", then Run.");
  console.log(
    "  2. In Supabase → Authentication → URL Configuration, add " +
      colors.cyan(site) +
      " as an allowed redirect.",
  );
  console.log("  3. " + colors.cyan("npm run dev") + " and sign in with " + colors.cyan(ALLOWED));
  console.log();
  rl.close();
}

main().catch((e) => {
  console.error(e);
  rl.close();
  process.exit(1);
});
