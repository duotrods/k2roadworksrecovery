# Task: Admin map of operators en route (Start Job → "Click when on Scene")

Spec: `docs/superpowers/specs/2026-11-09-admin-responder-map-design.md`
Full plan (code per step): `docs/superpowers/plans/2026-11-09-admin-responder-map.md`

## Plan
- [x] 1. Install `leaflet` + `react-leaflet`
- [x] 2. Write migration `0034_create_incident_responder_locations.sql` (USER runs it, I never apply it)
- [x] 3. Pure helpers + Vitest tests (`responderTracking.js`)
- [x] 4. `staffService`: upsert / clear / subscribe responder locations
- [x] 5. `useJobTracking` hook + `LocationSharingBanner`
- [x] 6. Wire tracking into `IncidentReportFormPage` (stops on "Click when on Scene")
- [x] 7. `useResponderLocations` hook + `ResponderMap` component
- [x] 8. Add lazy map card to admin `LiveIncidentsPage`
- [x] 9a. CLAUDE.md table row
- [ ] 9b. Manual verification matrix (needs migration 0034 run by the user + a real/DevTools location)


## Review
- Lint: 0 errors (1 pre-existing `loadFormData` hook warning, untouched). `npm test`: 79/79 pass
  (11 new in `responderTracking.test.js`). `npm run build`: OK.
- Leaflet is split into its own `map` chunk (vite.config.js) and the map is `lazy()`-loaded, so
  no other page downloads it.
- NOT yet verified end-to-end: needs migration 0034 applied (user runs it) and a manual pass
  with DevTools > Sensors (matrix in the plan, Task 9).
- Note: `/supabase`, `/docs` and `CLAUDE.md` are gitignored, so the migration, spec and plan do not
  appear in `git status`.

---

# Task: Eager background image upload on the incident form

## Plan
- [ ] Change staged file arrays to entries `{ id, file, status, result, error }`
- [ ] Start compress+upload the moment a file is added (select or drop)
- [ ] Track in-flight upload promises in a ref so "Next" can await them
- [ ] On Next/Save/Submit: await staged uploads (instant if already done), then persist
- [ ] Show per-file status (uploading / uploaded / failed + retry) in the dropzone
- [ ] Disable Next while any upload is in-flight or errored; keep data integrity
- [ ] Remove old `uploadingFiles` state + `uploadFiles`/`uploadStageFiles`
- [ ] Lint + build to verify no regressions

## Progress
- [x] Staged arrays now hold `{ id, file, status, result, error }` entries
- [x] `startUpload` compresses + uploads each file eagerly on add
- [x] `addFiles`/`handleFileSelect`/`handleDrop` kick off uploads immediately
- [x] `uploadPromisesRef` tracks in-flight promises; cleared on persist/reset
- [x] `collectStagedUploads` awaits in-flight uploads, throws if any failed
- [x] persistProgress/handleSave/handleSubmit use collectStagedUploads
- [x] Dropzone shows spinner/check/error + Retry per file
- [x] Buttons: `isUploading` label, disabled while `uploadsBusy`
- [x] Removed `uploadingFiles` state, `uploadFiles`/`uploadStageFiles`
- [x] Lint (0 errors) + build pass

## Review
- Uploads start the instant a file is added, overlapping with form entry, so
  "Next" resolves instantly when uploads are already done.
- Data integrity preserved: nothing advances/persists until every staged upload
  is confirmed; failures block Next and expose a Retry.
- Trade-off: a file removed after it already uploaded leaves an orphan object in
  R2 (acceptable; could add cleanup later).

## Lessons
- R2 buckets in the EU jurisdiction require the `.eu.` S3 endpoint; a plain
  endpoint silently 403s CORS ("CORS not configured for this bucket").
- AWS SDK v3 (>=3.729) bakes a default CRC32 checksum into presigned URLs;
  set `requestChecksumCalculation: "WHEN_REQUIRED"` for browser PUTs.

---

# Task: Expose live operator locations to Lense (M3 only)

## Plan
- [x] Pure filter/shaping helper (`src/utils/responderPublic.js`) + unit tests
- [x] `functions/api/responder-locations.js` (GET, `x-api-key` = `LENSE_API_KEY`, service-role read, M3-only, live-only, no operator name)
- [ ] User: set `LENSE_API_KEY` in Cloudflare env + `.dev.vars`
- [ ] Lense repo: Cloud Function proxy (verify Firebase auth + M3 access) + Leaflet map polling it

## Review
- Scheme scope is hard-coded server-side (`EXTERNAL_SCHEME_ALLOWLIST`); callers cannot widen it.
- Response omits operator name/user id; pin disappears when operator taps "on scene" (row deleted).
