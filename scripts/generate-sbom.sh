#!/usr/bin/env bash
# Regenerates the SBOM, license listings, and THIRD_PARTY_NOTICES.md from the installed dependency tree.
# Usage: npm run sbom, or scripts/generate-sbom.sh <project-dir> to run it against another checkout (release.yml).
set -euo pipefail

cd "${1:-$(dirname "$0")/..}"
mkdir -p sbom

npx --yes @cyclonedx/cyclonedx-npm --omit dev --output-format JSON --output-file sbom/openapi-backend.cdx.json
npx --yes @cyclonedx/cyclonedx-npm --output-format JSON --output-file sbom/openapi-backend.full.cdx.json
npx --yes license-checker --production --csv --out sbom/licenses-production.csv
npx --yes license-checker --csv --out sbom/licenses-all.csv

npx --yes license-checker --production --json | node -e '
const fs = require("fs");
const path = require("path");
const packages = JSON.parse(fs.readFileSync(0, "utf8"));
const today = new Date().toISOString().slice(0, 10);
const copyrightLine = /^\s*(copyright\s*(\(c\)|©)?\s*\d{4}.*|\(c\)\s*\d{4}.*)$/gim;
const packageNotes = {
  "bath-es5": "Fork of [bath](https://github.com/bouzuya/bath) by bouzuya, transpiled to ES5 for browser compatibility and published to npm as bath-es5 by Viljami Kuosmanen. Original work copyright bouzuya, MIT.",
};

let out = `# Third-party notices for openapi-backend

Runtime (production) dependencies distributed alongside openapi-backend, with their licenses and copyright holders. The full license text for each package is included below.
Generated from package-lock.json on ${today}.

`;

for (const [name, info] of Object.entries(packages)) {
  if (name.startsWith("openapi-backend@")) continue;
  const isLicenseFile = info.licenseFile && /licen[sc]e|copying|notice/i.test(path.basename(info.licenseFile));
  const licenseText = isLicenseFile ? fs.readFileSync(info.licenseFile, "utf8") : "";
  const holders = [...new Set((licenseText.match(copyrightLine) || []).map((line) => line.trim()))].slice(0, 3);
  out += `## ${name}\n- License: ${info.licenses}\n- Repository: ${info.repository || "n/a"}\n`;
  out += holders.map((line) => `- ${line}\n`).join("");
  const note = packageNotes[name.slice(0, name.lastIndexOf("@"))];
  if (note) out += `- Note: ${note}\n`;
  out += "\n";
  out += licenseText.trim()
    ? "````text\n" + licenseText.trim() + "\n````\n\n"
    : `_No license file is shipped with this package; it is licensed under ${info.licenses}._\n\n`;
}

fs.writeFileSync("THIRD_PARTY_NOTICES.md", out);
'

echo "Wrote sbom/ and THIRD_PARTY_NOTICES.md"
