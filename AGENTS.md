# Project instructions

This is the institution GitHub deployment source. Edit site/ for website changes. Do not regenerate it from sibling dashboard-v3 or old deliverables: those are previous versions.

- Cloudflare Workers serves static dist/ assets only; no D1, runtime Worker script or Cloudflare data storage.
- Google shared storage is existing Apps Script + Sheets + private Drive. Preserve its /exec URL unless the user requests a new deployment.
- Production branch is main. Cloudflare Builds runs npm run validate, then npx wrangler deploy. GitHub Actions only validates.
- Run npm run validate after code changes. Use npm run dry-run only when deployment configuration changes. Do not publish from local tools without user authorization.
- Never add operating data, participant photos, API keys, passwords, .env or database files to Git. site/google-config.js contains only the public web app URL.
- Apps Script source is apps-script/. Avoid logical assignment operators, Object.hasOwn and Array.at there. Server changes also require deployment through the Google Apps Script editor; Cloudflare deployment does not update Google code.
- Preserve attendance rules: weekday operations, holiday/closure exclusion, one attendance per participant per day, present '/', absent 'O', weekend/holiday '휴'.
- Performance: participant + date + normalized area name = one row. Use the earliest program start time's staff; retain program detail internally. Attendance cancellation must cancel its auto-generated performance; preserve manual sheet columns.
- Preserve the large accessible kiosk choices, persistent affiliation selector, white high-contrast background, photo caching and compression.
- Keep private docs and Google code outside site/. Only dist/ is public. A build must never include apps-script/, backups/ or local data.
