/*
 * Which build of the app made a change. Stamped on every ledger entry, so a
 * wrong bill can be traced to an old copy of the app still open on some phone.
 *
 * Rewritten by scripts/stamp-version.mjs before each `npm run build`.
 */
export const APP_VERSION = 'dev';
