# Roadmap

## Current request: real player activity and daily payouts
- [x] Audit activity writers, legacy migrations, live economy function, RLS and schedule metadata; production activity table was missing and economy used login timestamps.
- [x] Apply heartbeat-only activity and once-per-day eligibility to the shared production database; table/function read back successfully.
- [x] Fix the single visible-app heartbeat without login/profile dependencies or competing listeners; server timestamps and owner-scoped RLS retain compatibility with older published clients.
- [x] Run 9 heartbeat tests and 9 isolated PostgreSQL security/economy tests, including concurrent cycles and migration reapplication; latest build OK.
- [ ] Verify authenticated production entry/10-second/tab-return end-to-end — blocked: no account matches the requesting user; explicit account selection or preview sign-in is required. Production activity has 19 rows, but that alone does not verify this user's flow.
- [ ] Confirm the newly published client version — publishing requested; public homepage returns 200, but authenticated bundle deployment was not confirmed.
- [ ] Remove synthetic writers from historical 00756/00758/00759 migration files — blocked: migration-history protection rejects edits. The new applied migration removes the initializer and replaces payout qualification; do not replay old migrations individually.
- [ ] Apply changes directly to main — blocked: the environment uses a managed edit branch and does not permit branch switching; no direct-main claim is made.

## Current request: missile launch presentation
- [x] Align missile, exhaust and impact along one responsive flight path; all three endpoints verified at 1280px and 390px without browser errors.
- [x] Simplify level I–II launch controls and clarify selection, confirmation and reporting without changing game rules.
- [x] Check flight presentation on desktop/mobile; latest build OK.
- [ ] Verify a real launch end-to-end — blocked: no managed auth account matches the requesting user; preview sign-in required.

## Current request: complete visual redesign
- [x] Rebuild the shared visual system and navigation without changing game functions.
- [x] Unify every screen, forms, tables, dialogs and mobile layouts.
- [x] Verify landing, login, signup presentation and public ranking at desktop and mobile widths; password visibility and mode switching work without browser errors or page overflow.
- [ ] Verify authenticated game/admin screens visually — blocked: no managed session matches the requesting user; sign-in in preview is required.

## Earlier requests (separate from the visual redesign)

- [x] 1. Strona logowania bez przeskoku (hydration) — verified at mobile and desktop widths.
- [ ] 5. Flagi: brak listowania plików
- [ ] 6. Prywatność: skarbiec/surowce/arsenał innych państw ukryte
- [ ] 7. Panel admina podzielony na mniejsze części
- [ ] 8. Mniej obchodzenia typów
- [ ] 9. Testy kluczowych reguł
- [ ] 10. Wykres dochodu 7/30 dni
- [ ] 12. Propozycje umów od graczy
- [ ] 14. Instalacja na telefonie (PWA)
- [ ] 15. Raport po wypłacie 20:00
