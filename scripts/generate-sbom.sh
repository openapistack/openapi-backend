#!/usr/bin/env bash
# Regenerates the SBOM, license listings, and THIRD_PARTY_NOTICES.md from the installed dependency tree.
# Usage: npm run sbom
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p sbom

npx --yes @cyclonedx/cyclonedx-npm --omit dev --output-format JSON --output-file sbom/openapi-backend.cdx.json
npx --yes @cyclonedx/cyclonedx-npm --output-format JSON --output-file sbom/openapi-backend.full.cdx.json
npx --yes license-checker --production --csv --out sbom/licenses-production.csv
npx --yes license-checker --csv --out sbom/licenses-all.csv

npx --yes license-checker --production --json | node -e '
const fs = require("fs");
const packages = JSON.parse(fs.readFileSync(0, "utf8"));
const today = new Date().toISOString().slice(0, 10);
const copyrightLine = /^\s*(copyright\s*(\(c\)|©)?\s*\d{4}.*|\(c\)\s*\d{4}.*)$/gim;

let out = `# Third-party notices for openapi-backend

Runtime (production) dependencies distributed alongside openapi-backend, with their licenses and copyright holders. Each package ships its own full license text in node_modules.
Generated from package-lock.json on ${today}.

`;

for (const [name, info] of Object.entries(packages)) {
  if (name.startsWith("openapi-backend@")) continue;
  const licenseText = info.licenseFile ? fs.readFileSync(info.licenseFile, "utf8") : "";
  const holders = [...new Set((licenseText.match(copyrightLine) || []).map((line) => line.trim()))].slice(0, 3);
  out += `## ${name}\n- License: ${info.licenses}\n- Repository: ${info.repository || "n/a"}\n`;
  out += holders.map((line) => `- ${line}\n`).join("");
  out += "\n";
}

fs.writeFileSync("THIRD_PARTY_NOTICES.md", out);
'

echo "Wrote sbom/ and THIRD_PARTY_NOTICES.md"
