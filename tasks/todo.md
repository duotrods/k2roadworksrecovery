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
