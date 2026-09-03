# QRoll — Master Roadmap

Source: Bernard's "Complete App Upgrade and Development Instructions".
Status: [x] done · [~] partial · [ ] pending

## Phase 1 — Scanner + reports + credits (DONE)
- [x] Faster, non-blocking scanner (per-code lock, dedupe, confirmation beep)
- [x] Remove "Scans recorded" from dashboard
- [x] Report filters: Present / Absent / All (exports follow the filter)
- [x] Attendance grading: user-set weight (e.g. 5%) + auto score column
- [x] Developer credit card in Settings → About (Bern Studio / Agbenyo Bernard Atsu)

## Phase 2 — Offline attendance (DONE)
- [x] Local scan queue with original timestamps
- [x] Offline banner + pending count + manual "Sync now"
- [x] Auto-sync on reconnect, duplicate-safe replay

## Phase 3 — Student self-service portal
- [ ] Homepage "Student Page" button
- [ ] Index-number lookup → first-time password creation (hashed, server-side)
- [ ] Student login (index + password) + secure reset via email on record
- [ ] Student dashboard: attendance %, present/absent/late sessions, warnings
- [ ] Strict isolation: a student sees only their own records

## Phase 4 — Reports upgrade
- [ ] Complete compilation report per course (all sessions rolled up)
- [ ] Single-session/day report download
- [ ] PDF / Excel / CSV export parity

## Phase 5 — Academic semester management + archive
- [ ] Faculty → Department → Programme → Year → Semester → Course structure
- [ ] End-of-semester archive prompt; lock + preserve, open clean workspace
- [ ] Academic History dashboard + cross-semester search
- [ ] Historical reports (attendance, performance, department, tutor workload)
- [ ] Role-based access: super admin / dept head / tutor / TA / student

## Phase 6 — Assignments, announcements, notifications
- [ ] Assignments with deadlines + submission links
- [ ] Tutor messaging to a level, several levels, or all classes
- [ ] Web push notifications (PWA installed / added to home screen)
- [ ] Smart alerts: attendance < 75%, quizzes, room changes, cancellations

## Phase 7 — Billing (Paystack)
- [~] Plans, billing page, webhook route, test-mode toggle in place
- [ ] Live Paystack keys once the account is verified

## Phase 8 — Hardening, performance, scale report
- [ ] Full bug/security/database sweep + written report
- [ ] Indexes, pagination, query batching for 1000+ users and large attendance tables
- [ ] Geofence + parent-QR verification pass (behaviour unchanged, accuracy fixed)
- [ ] Animation/perf polish pass across all pages

## Cross-cutting
- Single account type: tutors/admins only. Students are records, never auth users.
