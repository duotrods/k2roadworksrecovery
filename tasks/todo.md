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

---

# Task: Background location tracking via Capacitor (Android only) — APPROVED 2026-11-17

Goal: operator location keeps updating on the admin map when the app is locked / backgrounded.
The PWA can't: `watchPosition` + wake lock are foreground-only.

## Decisions
- Capacitor wrapper of the existing React app, **Android only** (boss: iPhone out of scope; iOS can be added later)
- Free plugin `@capacitor-community/background-geolocation` (switch to Transistorsoft only if testing shows dropped updates)
- Tracking window: Start Job -> "On Scene" (unchanged; whole-shift is a boss decision, not in scope)
- Distribution: signed APK/AAB direct or Play internal testing (check Google's current sideloading rules)

## Plan
- [x] 1. Install Capacitor + plugin; `capacitor.config.ts` (webDir `dist`); `npx cap add android`
- [x] 2. `VITE_API_BASE_URL` helper (`src/utils/apiUrl.js`, unit-tested); use in all 5 `/api` fetches
- [x] 3. CORS (+ OPTIONS) on `functions/api/*` for the native app origin
- [x] 4. (dropped) offline queue — admin map only needs the latest point (one row per incident), so a failed send just retries on the next fix
- [x] 5. Split `useJobTracking`: web path (unchanged) / native path (plugin) via `Capacitor.isNativePlatform()`
- [x] 6. Manifest perms: supplied by the plugin (fine/coarse location, FGS location, notifications). No ACCESS_BACKGROUND_LOCATION needed — foreground service started while app is visible
- [x] 7. `LocationSharingBanner` native states + Open settings button. (Battery-optimisation prompt: text/guide only for now — an in-app prompt needs another plugin)
- [x] 8. Stop + clear live row on On Scene / sign-out (same as web)
- [ ] 9. Lint + test + build + `cap sync`; USER builds in Android Studio and runs device matrix
- [ ] 10. Device matrix (user): locked screen 10+ min, app switched, no signal then regain, permission denied

## Needs from user
- Android Studio + JDK to build the APK; a signing keystore (kept safe, never committed)
- App id (default `uk.co.k2roadworks.recovery` unless told otherwise)
- Supabase auth redirect URL for the app origin if OAuth/magic links are used

## Progress notes
- `capacitor.config.json`: `android.useLegacyBridge` (stops updates halting after 5 min in background) and
  `CapacitorHttp.enabled` (WebView HTTP is throttled in background, so supabase/fetch go native).
- `VITE_API_BASE_URL` must be set at build time for the Android build (e.g. the Cloudflare Pages origin).
- `functions/api/_middleware.js` allows CORS only from `https://localhost` / `capacitor://localhost`.
- Build: `npm run android:sync` then `npm run android:open` (Android Studio). Verified: lint clean on changed
  files (7 pre-existing errors elsewhere), 87/87 tests, vite build OK, `cap add android` OK.
- NOT verified: anything on a real device. Step 9/10 are the user's.

---

# Task: Branded splash + loader (Android app)
- [x] Native splash: static K2 mark (`splash_icon.png` in drawable-*dpi) on brand blue via `Theme.SplashScreen` attrs in `android/.../styles.xml`
- [x] In-app animated loader `src/components/common/K2Loader.jsx(.css)` replaces `LoadingSpinner` + `PageLoader` in `App.jsx`
- [x] Source art in `design/splash/` (preview HTML, mark PNG, 1152px splash icon); mark extracted from `public/icon-512.png` (512px source — swap in a vector/hi-res K2 logo if one exists)
- [ ] USER: press Run in Android Studio, confirm splash + loader on emulator (not verified on device)
