import { BLOCKED_ANALYTICS_TOKENS, findBlockedAnalyticsTokens } from "../src/security/blocked-domains";

const targetsRaw = process.env.SCAN_URLS ?? "";
const targets = targetsRaw
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (targets.length === 0) {
  console.error("SCAN_URLS is required (comma-separated list of URLs).");
  process.exit(1);
}

async function scanUrl(url: string): Promise<boolean> {
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Failed to fetch ${url} (status ${response.status}).`);
    return false;
  }

  const html = await response.text();
  const matches = findBlockedAnalyticsTokens(html);

  if (matches.length > 0) {
    console.error(`Blocked analytics tokens found in ${url}: ${matches.join(", ")}`);
    return false;
  }

  console.log(`OK: ${url}`);
  return true;
}

async function run(): Promise<void> {
  const results = await Promise.all(
    targets.map(async (url) => {
      try {
        return await scanUrl(url);
      } catch (error) {
        console.error(`Error scanning ${url}:`, error);
        return false;
      }
    }),
  );

  if (results.some((ok) => !ok)) {
    process.exitCode = 1;
    return;
  }

  console.log(`No blocked analytics tokens detected (scanned: ${BLOCKED_ANALYTICS_TOKENS.join(", ")}).`);
}

run();
