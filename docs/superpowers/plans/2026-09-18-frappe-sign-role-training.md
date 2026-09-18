# Frappe Sign Role-Based Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit Frappe Sign and populate `eben.isambane.co.za` with four complete role-based LMS courses, captioned interface videos, annotated screenshots, mastery quizzes, and an enforced Internal Signer → Requestor → Manager program.

**Architecture:** Keep the training source in a focused `frappe_sign.training` package: JSON catalog files hold prose, assessment, media, and ordering data; a validator provides fast feedback; and an idempotent installer turns that catalog into LMS records and uploaded assets. Playwright drives the real installed interface against disposable fictional training records, while FFmpeg burns captions into its MP4 recordings. Live publication is a final, explicit step after record-level and learner-interface verification.

**Tech Stack:** Frappe Framework v16, Frappe Learning/LMS, Python 3.14, Frappe `IntegrationTestCase`, EditorJS lesson JSON, Node.js Playwright 1.57, bundled Chromium, bundled FFmpeg, Pillow, JSON, Markdown.

**Spec:** `docs/superpowers/specs/2026-09-18-frappe-sign-role-training-design.md`

## Global Constraints

- Create exactly four independent courses: Internal Signers, Requestors, Managers, and External and Link-Only Signers.
- Create `Frappe Sign Role Progression` in this enforced order: Internal Signers, Requestors, Managers.
- Keep the external course outside the ordered program and do not assume Desk access.
- Set `include_in_preview = 1` on every external-course instructional lesson so link-only guidance is anonymously readable; require login only for tracked attempts and completion history.
- Set every graded quiz to `passing_percentage = 100` and `max_attempts = 20`.
- Enable answer explanations and submission history; disable negative marking.
- Set `enforce_lesson_completion = 1` on every course.
- Use real installed Frappe Sign screens, fictional records, 1080p MP4, burned-in captions, lesson transcripts, and annotated screenshots.
- Never expose signing tokens, certificate passwords, private file URLs, real personal data, or production-sensitive documents in media.
- Do not alter Frappe Sign workflow or permission behaviour as part of this work.
- Do not modify or republish the existing Recruitment LMS course.
- Do not send email to real recipients; all capture identities use the reserved `.invalid` domain.
- Preserve the pre-existing uncommitted `pyproject.toml` change.

---

## File Structure

Create these focused units:

- `docs/audits/2026-09-18-frappe-sign-application-audit.md` — evidence-backed audit report and training implications.
- `frappe_sign/training/catalog.py` — catalog loader, typed access helpers, and cross-file validation.
- `frappe_sign/training/catalog/*.json` — one source file per course plus the ordered program.
- `frappe_sign/training/install.py` — idempotent LMS record and File creation/update logic.
- `frappe_sign/training/verify.py` — database-level completeness and safety verification.
- `frappe_sign/training/demo_data.py` — disposable fictional users, PDFs, profiles, and requests for capture.
- `frappe_sign/training/media/scenarios.json` — browser routes, actions, captions, crops, and output names.
- `frappe_sign/training/media/capture.js` — Playwright login, interaction, screenshot, and video capture.
- `frappe_sign/training/media/render.py` — caption burn-in, screenshot annotation, transcript output, and media manifest hashing.
- `frappe_sign/training/tests/` — catalog, installer, demo-data, media-manifest, and verifier tests.
- `docs/training/frappe-sign/media-manifest.json` — generated media filenames, lesson ownership, SHA-256 hashes, dimensions, and durations; no binary media is committed.
- `docs/training/frappe-sign/live-verification.md` — final learner-interface and prerequisite evidence.

Generated binary media lives under `/tmp/frappe-sign-training-media` during production and is uploaded as public LMS `File` records. Do not add MP4 or PNG binaries to Git.

---

### Task 1: Complete the Application Audit

**Files:**
- Create: `docs/audits/2026-09-18-frappe-sign-application-audit.md`
- Read: `README.md`
- Read: `API_README.md`
- Read: `frappe_sign/hooks.py`
- Read: `frappe_sign/permissions.py`
- Read: `frappe_sign/api/*.py`
- Read: `frappe_sign/utils/*.py`
- Read: `frappe_sign/frappe_sign/doctype/**/*.json`
- Read: `frappe_sign/frappe_sign/doctype/**/*.py`
- Read: `frappe_sign/frappe_sign/doctype/**/*.js`
- Read: `frappe_sign/frappe_sign/page/**/*.js`
- Read: `frappe_sign/templates/pages/*`
- Read: `frappe_sign/www/*`

**Interfaces:**
- Consumes: the approved design specification and the installed `frappe_sign` source tree.
- Produces: an audit report whose feature matrix and findings determine all course wording and demonstrations.

- [ ] **Step 1: Capture the installed app and live configuration inventory**

Run:

```bash
bench --site eben.isambane.co.za execute frappe.get_installed_apps
bench --site eben.isambane.co.za execute frappe.client.get_list --kwargs '{"doctype":"Frappe Sign Request","fields":["name","status","source_type","signing_mode","tamper_status"],"limit_page_length":200}'
bench --site eben.isambane.co.za execute frappe.client.get --kwargs '{"doctype":"Frappe Sign Settings","name":"Frappe Sign Settings"}'
```

Record counts and settings, but redact file URLs, email addresses, names, hashes, tokens, and certificate metadata from the report.

- [ ] **Step 2: Build the audit feature and permission matrix**

Use these report columns for every feature:

```markdown
| Area | User-visible behaviour | Roles | Statuses/preconditions | Evidence | Training implication |
|---|---|---|---|---|---|
```

Cover request creation, uploaded PDFs, Frappe documents, configured source DocTypes, print formats, automatic attachment, automatic submission, parallel order, sequential order, cohorts, designer fields, send, copy link, resend, cancel, decline, expiry, signature profiles, internal portal, link-only portal, final PDFs, audit certificates, certificate-signed PDFs, hashes, event chains, validator, tamper checks, reminders, and templates.

- [ ] **Step 3: Audit permission boundaries and sensitive operations**

Trace and cite:

```text
System Manager / Frappe Sign Manager
Frappe Sign Sender
Frappe Sign User / Frappe Sign Signer
Guest or token-only signer
Request creator versus unrelated sender
Internal signer versus external signer
```

For each role, document create/read/write/cancel/validate/settings/template/profile access and the server-side function enforcing it.

- [ ] **Step 4: Audit code-to-documentation and code-to-UI consistency**

Compare the README and API README with DocType fields, client buttons, whitelisted methods, portal routes, and status transitions. Classify each discrepancy as Critical, High, Medium, Low, or Informational and state confidence as Confirmed, Strong inference, or Needs live reproduction.

- [ ] **Step 5: Run the existing Frappe Sign tests as audit evidence**

Run:

```bash
bench --site eben.isambane.co.za run-tests --app frappe_sign
```

Expected: exit 0. If a test fails, record the exact failure in the audit and do not change application behaviour under this plan.

- [ ] **Step 6: Verify the audit report structure and redaction**

Run:

```bash
rg -n '^## (Executive Summary|Scope and Method|Feature Matrix|Permission Matrix|Workflow Findings|Security and Evidence|Documentation Discrepancies|Usability and Training Implications|Findings|Limitations)$' docs/audits/2026-09-18-frappe-sign-application-audit.md
rg -n '(token=|certificate_password|/private/files/|@[A-Za-z0-9.-]+\.(co\.za|com|org))' docs/audits/2026-09-18-frappe-sign-application-audit.md
```

Expected: all ten headings appear; the second command returns no production secrets or real addresses.

- [ ] **Step 7: Commit the audit**

```bash
git add docs/audits/2026-09-18-frappe-sign-application-audit.md
git commit -m "docs: audit Frappe Sign workflows and permissions"
```

---

### Task 2: Define and Validate the Training Catalog Contract

**Files:**
- Create: `frappe_sign/training/__init__.py`
- Create: `frappe_sign/training/catalog.py`
- Create: `frappe_sign/training/catalog/program.json`
- Create: `frappe_sign/training/tests/__init__.py`
- Create: `frappe_sign/training/tests/test_catalog.py`

**Interfaces:**
- Consumes: JSON files from `frappe_sign/training/catalog/`.
- Produces: `load_catalog() -> dict[str, dict]`, `load_program() -> dict`, and `validate_catalog(catalog: dict, program: dict) -> list[str]`.

- [ ] **Step 1: Write failing contract tests**

Add tests that require exactly these stable slugs and program order:

```python
COURSE_SLUGS = {
	"frappe-sign-internal-signers",
	"frappe-sign-requestors",
	"frappe-sign-managers",
	"frappe-sign-external-signers",
}

PROGRAM_ORDER = [
	"frappe-sign-internal-signers",
	"frappe-sign-requestors",
	"frappe-sign-managers",
]

def test_catalog_contract():
	catalog = load_catalog()
	errors = validate_catalog(catalog, load_program())
	assert errors == []
	assert set(catalog) == COURSE_SLUGS
	assert load_program()["courses"] == PROGRAM_ORDER
```

Also assert that every course has `published`, `enforce_lesson_completion`, `chapters`, and `instructor`; every lesson has a globally unique ID, title, markdown body, transcript, media list, and explicit `include_in_preview`; every quiz has 100/20 settings and three to fifteen questions; and every choice has an explanation. Require `include_in_preview = 1` for all external-course instructional lessons.

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
bench --site eben.isambane.co.za run-tests --app frappe_sign --module frappe_sign.training.tests.test_catalog
```

Expected: FAIL because `frappe_sign.training.catalog` does not exist.

- [ ] **Step 3: Implement the catalog loader and validator**

Use this public shape:

```python
CATALOG_DIR = Path(__file__).with_name("catalog")

def load_catalog() -> dict[str, dict]:
	return {
		path.stem: json.loads(path.read_text(encoding="utf-8"))
		for path in sorted(CATALOG_DIR.glob("*.json"))
		if path.name != "program.json"
	}

def load_program() -> dict:
	return json.loads((CATALOG_DIR / "program.json").read_text(encoding="utf-8"))

def validate_catalog(catalog: dict, program: dict) -> list[str]:
	"""Return deterministic human-readable contract violations; never mutate input."""
```

Validate unique IDs, exact course slugs, valid program references, non-empty bodies, media filename safety, quiz range, correct-answer presence, explanation presence, 100% pass mark, 20 attempts, answer visibility, submission history, and no negative marking.

- [ ] **Step 4: Add the ordered-program source**

Create `program.json` with:

```json
{
  "title": "Frappe Sign Role Progression",
  "published": 1,
  "enforce_course_order": 1,
  "courses": [
    "frappe-sign-internal-signers",
    "frappe-sign-requestors",
    "frappe-sign-managers"
  ]
}
```

- [ ] **Step 5: Run the contract tests**

Run the Task 2 test command.

Expected: tests still fail only because the four course JSON files are absent. This establishes the red state for Tasks 3 and 4.

- [ ] **Step 6: Commit the catalog contract**

```bash
git add frappe_sign/training
git commit -m "test: define Frappe Sign training catalog contract"
```

---

### Task 3: Author the Internal and External Signer Courses

**Files:**
- Create: `frappe_sign/training/catalog/frappe-sign-internal-signers.json`
- Create: `frappe_sign/training/catalog/frappe-sign-external-signers.json`
- Modify: `frappe_sign/training/tests/test_catalog.py`

**Interfaces:**
- Consumes: the catalog contract and audit findings.
- Produces: two complete course dictionaries consumed by `load_catalog()` and the LMS installer.

- [ ] **Step 1: Add failing curriculum assertions**

Require these chapter titles and minimum lesson counts:

```python
EXPECTED = {
	"frappe-sign-internal-signers": {
		"chapters": ["Your role in Frappe Sign", "Access and profile", "Review and sign", "Exceptions and completion", "Assessment"],
		"minimum_lessons": 15,
		"minimum_media": 12,
	},
	"frappe-sign-external-signers": {
		"chapters": ["Before opening the link", "Review the request", "Complete the document", "Decline or resolve a problem", "After signing", "Assessment"],
		"minimum_lessons": 18,
		"minimum_media": 9,
	},
}
```

Assert that internal content mentions Desk, Documents To Sign, profile management, authenticated access, final attachment awareness, and automatic submission awareness. Assert that external content mentions emailed link, no Desk access, link confidentiality, consent, expiry, decline, and not forwarding the link.

- [ ] **Step 2: Run the curriculum tests to verify they fail**

Run the Task 2 test command.

Expected: FAIL because both course files are absent.

- [ ] **Step 3: Author the Internal Signer catalog**

Use all five chapters and fifteen lessons listed in the specification. Every instructional lesson contains:

```json
{
  "id": "internal-opening-assigned-documents",
  "title": "Opening Assigned Documents",
  "body": "Markdown with purpose, numbered steps, caution, expected result, and troubleshooting guidance.",
  "transcript": "Caption-equivalent text for the associated demonstration.",
  "media": [
    {"kind": "video", "file": "internal-opening-assigned-documents.mp4", "alt": "Opening Documents To Sign and selecting an assigned request"},
    {"kind": "image", "file": "internal-opening-assigned-documents.png", "alt": "Documents To Sign page with the assigned request highlighted"}
  ],
  "quiz": null
}
```

Use fictional examples only. Include knowledge checks after chapters 2, 3, and 4, then a ten-to-fifteen-question final quiz. Do not teach request creation in this course.

- [ ] **Step 4: Author the External Signer catalog**

Use all six chapters and eighteen lessons listed in the specification. Start the learner journey at the invitation email and `/sign/<token>` page. Explain link confidentiality, consent, assigned fields, submit, decline, expiry, invalid links, and contacting the requestor. Do not mention Desk navigation as a required action.

Include knowledge checks after chapters 2, 3, and 4, then a ten-to-fifteen-question final quiz.

- [ ] **Step 5: Run and pass the signer curriculum tests**

Run the Task 2 test command.

Expected: the two signer-specific tests pass; the exact-four-course contract remains red until Task 4.

- [ ] **Step 6: Commit both signer courses**

```bash
git add frappe_sign/training/catalog frappe_sign/training/tests/test_catalog.py
git commit -m "feat: author internal and external signer training"
```

---

### Task 4: Author the Requestor and Manager Courses

**Files:**
- Create: `frappe_sign/training/catalog/frappe-sign-requestors.json`
- Create: `frappe_sign/training/catalog/frappe-sign-managers.json`
- Modify: `frappe_sign/training/tests/test_catalog.py`

**Interfaces:**
- Consumes: audit findings, catalog contract, and signer-course terminology.
- Produces: the remaining two course dictionaries and a fully valid four-course catalog.

- [ ] **Step 1: Add failing curriculum assertions**

Require these chapter titles and minimum lesson counts:

```python
EXPECTED = {
	"frappe-sign-requestors": {
		"chapters": ["Requestor responsibilities", "Create the source request", "Configure signers and fields", "Automate source completion", "Send and monitor", "Close-out and evidence", "Assessment"],
		"minimum_lessons": 27,
		"minimum_media": 18,
	},
	"frappe-sign-managers": {
		"chapters": ["Governance and legal positioning", "Roles and access", "Global settings", "Source documents and automation", "Templates and operating standards", "Certificates and validation", "Operations and troubleshooting", "Assessment"],
		"minimum_lessons": 29,
		"minimum_media": 18,
	},
}
```

Assert that Requestors contains exact coverage for `attach_signed_pdf_to_source`, `attach_signed_pdf_field`, and `submit_source_on_completion`. Assert that Managers contains configuration, governance, source DocTypes, print formats, Attach fields, ordinary-signature positioning, certificate types, tamper validation, and troubleshooting.

- [ ] **Step 2: Run the curriculum tests to verify they fail**

Run the Task 2 test command.

Expected: FAIL because Requestor and Manager course files are absent.

- [ ] **Step 3: Author the Requestor catalog**

Use all seven chapters and twenty-seven lessons from the specification. The automation chapter must provide a single end-to-end Frappe-document scenario that:

```text
selects a configured source DocType and record
selects an applicable Print Format
checks Attach Signed PDF to Source
selects the target Attach field
checks Submit Source on Completion
adds signers and fields
sends and completes the request
verifies the File attachment and submitted source docstatus
```

Include parallel, sequential, and cohort examples; designer field assignment; copy-link safety; resend; cancel; status tracking; final evidence; and tamper verification. Include checks after chapters 2 through 6 and a ten-to-fifteen-question final quiz.

- [ ] **Step 4: Author the Manager catalog**

Use all eight chapters and twenty-nine lessons from the specification. Separate policy from operation: explain what managers decide, which setting implements it, the safe default, and how to test it. Preserve the README statement that Frappe Sign supports ordinary electronic signatures and is not by default an accredited Advanced Electronic Signature service.

Include checks after chapters 2 through 7 and a ten-to-fifteen-question final quiz.

- [ ] **Step 5: Run the complete catalog suite**

Run the Task 2 test command.

Expected: PASS with exactly four course files, all unique lesson IDs, valid 100%/20-attempt quizzes, and the exact program order.

- [ ] **Step 6: Commit the Requestor and Manager courses**

```bash
git add frappe_sign/training/catalog frappe_sign/training/tests/test_catalog.py
git commit -m "feat: author requestor and manager training"
```

---

### Task 5: Build the Idempotent LMS Installer

**Files:**
- Create: `frappe_sign/training/install.py`
- Create: `frappe_sign/training/tests/test_install.py`

**Interfaces:**
- Consumes: `load_catalog()`, `load_program()`, and `/tmp/frappe-sign-training-media/media-manifest.json`.
- Produces: `install_courses(media_root: str, publish: bool = False) -> dict`, `install_program(course_names: dict[str, str], publish: bool = False) -> str`, and `install_all(media_root: str, publish: bool = False) -> dict`.

- [ ] **Step 1: Write failing installer tests**

Test these behaviours with `IntegrationTestCase`:

```python
def test_install_all_is_idempotent(self):
	first = install_all(self.media_root, publish=False)
	second = install_all(self.media_root, publish=False)
	self.assertEqual(first["courses"], second["courses"])
	self.assertEqual(frappe.db.count("LMS Course", {"title": ["like", "Frappe Sign%"]}), 4)

def test_quiz_mastery_settings(self):
	install_all(self.media_root, publish=False)
	rows = frappe.get_all("LMS Quiz", {"course": ["in", self.course_names]}, ["passing_percentage", "max_attempts", "show_answers", "show_submission_history", "enable_negative_marking"])
	self.assertTrue(rows)
	for row in rows:
		self.assertEqual((row.passing_percentage, row.max_attempts), (100, 20))
		self.assertEqual((row.show_answers, row.show_submission_history, row.enable_negative_marking), (1, 1, 0))
```

Also test exact course/chapter/lesson order, stable updates without duplicates, EditorJS upload/quiz blocks, program order, draft-by-default behaviour, and non-modification of a fixture course titled Recruitment.

- [ ] **Step 2: Run installer tests to verify they fail**

Run:

```bash
bench --site eben.isambane.co.za run-tests --app frappe_sign --module frappe_sign.training.tests.test_install
```

Expected: FAIL because `install.py` does not exist.

- [ ] **Step 3: Implement deterministic record helpers**

Implement these private helpers:

```python
def _upsert_course(slug: str, data: dict, publish: bool) -> Document: ...
def _upsert_chapter(course: Document, index: int, data: dict) -> Document: ...
def _upsert_question(course_slug: str, quiz_id: str, index: int, data: dict) -> Document: ...
def _upsert_quiz(course: Document, lesson: Document, data: dict) -> Document: ...
def _upsert_media_file(media_root: Path, filename: str) -> str: ...
def _build_editorjs_content(lesson_data: dict, file_urls: dict[str, str], quiz_name: str | None) -> str: ...
```

Use stable titles and custom deterministic lookup keys in content-owned names where DocType naming permits. For generated autonames, look up by exact title plus parent course/lesson before inserting. Replace chapter and lesson child tables with catalog order on every run. Copy each catalog lesson's `include_in_preview` value to `Course Lesson.include_in_preview`.

- [ ] **Step 4: Implement EditorJS lesson content**

Generate blocks in this order:

```python
blocks = [
	{"type": "paragraph", "data": {"text": rendered_intro_html}},
	*[{"type": "upload", "data": {"file_url": url, "file_type": file_type}} for url, file_type in media],
	{"type": "paragraph", "data": {"text": rendered_steps_and_transcript_html}},
	*([{"type": "quiz", "data": {"quiz": quiz_name}}] if quiz_name else []),
]
```

Store `json.dumps({"time": 0, "version": "2.29.1", "blocks": blocks})` in `Course Lesson.content`.

- [ ] **Step 5: Implement File and LMS record safety**

Accept only filenames present in the generated manifest, verify SHA-256 before upload, set course media public, and refuse paths outside `media_root`. Never delete unrelated LMS or File records. Set all four courses and the program to unpublished unless `publish=True`.

- [ ] **Step 6: Implement ordered-program creation**

Upsert `LMS Program` by exact title, set `enforce_course_order = 1`, and replace `program_courses` with the three course names in catalog order. Do not add the external course.

- [ ] **Step 7: Run installer tests and the full app suite**

Run:

```bash
bench --site eben.isambane.co.za run-tests --app frappe_sign --module frappe_sign.training.tests.test_install
bench --site eben.isambane.co.za run-tests --app frappe_sign
```

Expected: both commands exit 0.

- [ ] **Step 8: Commit the installer**

```bash
git add frappe_sign/training/install.py frappe_sign/training/tests/test_install.py
git commit -m "feat: add idempotent LMS training installer"
```

---

### Task 6: Build Disposable Demo Data and the Media Pipeline

**Files:**
- Create: `frappe_sign/training/demo_data.py`
- Create: `frappe_sign/training/media/scenarios.json`
- Create: `frappe_sign/training/media/capture.js`
- Create: `frappe_sign/training/media/render.py`
- Create: `frappe_sign/training/tests/test_demo_data.py`
- Create: `frappe_sign/training/tests/test_media_manifest.py`

**Interfaces:**
- Consumes: catalog media filenames and installed Frappe Sign routes/actions.
- Produces: `create_demo_data() -> dict`, `remove_demo_data() -> dict`, raw Playwright WebM/PNG files, and rendered MP4/PNG/transcript files plus `media-manifest.json` under `/tmp/frappe-sign-training-media`.

- [ ] **Step 1: Write failing demo-data safety tests**

Assert that all identities end in `@example.invalid`, every record has a `TRAINING-FRAPPE-SIGN-` prefix, no method commits internally, removal targets only prefixed records/users, and no outgoing email is created while `frappe.flags.mute_emails` is active.

- [ ] **Step 2: Write failing media-plan tests**

Assert that every catalog media filename has exactly one scenario output, every scenario includes a course slug, lesson ID, 1920×1080 viewport, captions, safe route type, and no literal `/sign/` token, password, private URL, or real email address. Assert minimum media totals from Tasks 3 and 4.

- [ ] **Step 3: Run both test modules to verify they fail**

Run:

```bash
bench --site eben.isambane.co.za run-tests --app frappe_sign --module frappe_sign.training.tests.test_demo_data
bench --site eben.isambane.co.za run-tests --app frappe_sign --module frappe_sign.training.tests.test_media_manifest
```

Expected: FAIL because the demo and media modules do not exist.

- [ ] **Step 4: Implement disposable fictional training data**

Create manager, requestor, internal signer, and external signer identities under `example.invalid`; a simple generated training PDF; signature profiles; uploaded-PDF and Frappe-document requests in representative statuses; parallel and sequential signer examples; and a completed evidence example. Return record names and one-time capture credentials through stdout, never a committed file.

Use:

```python
PREFIX = "TRAINING-FRAPPE-SIGN-"
EMAIL_DOMAIN = "example.invalid"

def create_demo_data() -> dict:
	"""Create or reset only prefixed training records and return browser-capture references."""

def remove_demo_data() -> dict:
	"""Delete only records created by create_demo_data, in dependency-safe order."""
```

- [ ] **Step 5: Define the browser scenario manifest**

Create scenarios for at least these real workflows:

```text
internal: documents list, profile methods, review/fields/consent, decline/completion
external: email-link landing, review/consent, complete fields, decline/error handling
requestor: uploaded PDF, Frappe source, signer order, designer, attach-and-submit automation, send/monitor/evidence
manager: roles, settings, source DocTypes, templates, certificates, validator/tamper, troubleshooting states
```

Each video scenario supplies action selectors, human-paced delays, caption text and time ranges, screenshot checkpoints, and redaction selectors.

- [ ] **Step 6: Implement Playwright capture**

Load Playwright from `apps/wiki/node_modules/playwright`, use `chromium/headless_shell`, record at 1920×1080, and accept runtime-only credentials and resolved signing URLs through environment variables. Fail if a redaction selector or expected page heading is missing.

Example command contract:

```bash
node apps/frappe_sign/frappe_sign/training/media/capture.js \
  --base-url http://127.0.0.1:8000 \
  --scenarios apps/frappe_sign/frappe_sign/training/media/scenarios.json \
  --output /tmp/frappe-sign-training-media/raw
```

- [ ] **Step 7: Implement caption and screenshot rendering**

Use `/home/eben/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux` to transcode Playwright WebM files to H.264 MP4 at 1920×1080 and burn caption timing from the scenario manifest. Use Pillow for numbered callouts, restrained highlights, and 1920×1080 PNG output. Emit transcripts and this manifest entry shape:

```json
{
  "file": "requestor-attach-submit.mp4",
  "course": "frappe-sign-requestors",
  "lesson": "requestor-automate-source-completion",
  "sha256": "64 lowercase hexadecimal characters",
  "width": 1920,
  "height": 1080,
  "duration_seconds": 74.2,
  "captioned": true
}
```

- [ ] **Step 8: Run and pass demo/media tests**

Run both Task 6 test commands.

Expected: PASS.

- [ ] **Step 9: Commit the pipeline**

```bash
git add frappe_sign/training/demo_data.py frappe_sign/training/media frappe_sign/training/tests
git commit -m "feat: add safe Frappe Sign training media pipeline"
```

---

### Task 7: Capture, Render, and Review the Real Training Media

**Files:**
- Generate: `/tmp/frappe-sign-training-media/raw/*`
- Generate: `/tmp/frappe-sign-training-media/rendered/*`
- Create: `docs/training/frappe-sign/media-manifest.json`

**Interfaces:**
- Consumes: Task 6 demo data and scenario pipeline.
- Produces: reviewed, captioned, hashed media ready for Task 8 upload.

- [ ] **Step 1: Start the local site and create demo data**

Run the development server in a persistent session, then run:

```bash
bench --site eben.isambane.co.za execute frappe_sign.training.demo_data.create_demo_data
```

Expected: a JSON result containing only prefixed record names, `.invalid` identities, runtime credentials, and capture references.

- [ ] **Step 2: Capture every scenario**

Run the Task 6 Playwright command with runtime credentials in process environment variables. Expected: every scenario ends successfully and emits its raw video/screenshot files.

- [ ] **Step 3: Render captions and annotations**

Run:

```bash
./env/bin/python apps/frappe_sign/frappe_sign/training/media/render.py \
  --scenarios apps/frappe_sign/frappe_sign/training/media/scenarios.json \
  --input /tmp/frappe-sign-training-media/raw \
  --output /tmp/frappe-sign-training-media/rendered
```

Expected: exit 0 and a generated `media-manifest.json` whose files all exist.

- [ ] **Step 4: Perform automated media checks**

For every MP4, run `/home/eben/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux -i <file> -f null -` and parse stderr to assert `Video: h264`, `1920x1080`, positive duration, and the absence of an `Audio:` stream. Verify PNG dimensions with Pillow and verify every file hash against the manifest.

- [ ] **Step 5: Visually inspect every output**

Create contact sheets per course, inspect them, and view at least the first, middle, and last frame of every MP4. Reject and recapture any asset with unreadable captions, clipped controls, missing highlights, visible secrets, real personal data, or incorrect role navigation.

- [ ] **Step 6: Remove disposable demo data**

Run:

```bash
bench --site eben.isambane.co.za execute frappe_sign.training.demo_data.remove_demo_data
```

Expected: only prefixed training data is removed; course media in `/tmp` remains.

- [ ] **Step 7: Save and commit the non-binary manifest**

Copy the reviewed manifest to `docs/training/frappe-sign/media-manifest.json`, then run:

```bash
git add docs/training/frappe-sign/media-manifest.json
git commit -m "docs: record reviewed Frappe Sign training media"
```

---

### Task 8: Install and Publish the Four Courses and Ordered Program

**Files:**
- Create: `frappe_sign/training/verify.py`
- Create: `frappe_sign/training/tests/test_verify.py`
- Modify live site: `eben.isambane.co.za` LMS and File records

**Interfaces:**
- Consumes: reviewed media and the complete catalog.
- Produces: four published LMS courses, all chapters/lessons/quizzes/questions/media, and one published ordered program.

- [ ] **Step 1: Write failing database-verification tests**

Define `verify_installation() -> dict` returning `{"ok": bool, "errors": list[str], "counts": dict}`. Tests must catch a missing course, wrong course order, missing lesson, missing File, hash mismatch, wrong quiz pass mark/attempts, unpublished record, wrong lesson order, or external course in the ordered program.

- [ ] **Step 2: Run verifier tests to confirm the red state**

Run:

```bash
bench --site eben.isambane.co.za run-tests --app frappe_sign --module frappe_sign.training.tests.test_verify
```

Expected: FAIL because `verify.py` does not exist.

- [ ] **Step 3: Implement the verifier**

Compare live records to catalog IDs and media hashes. Report exact record and field differences. Include counts for courses, chapters, lessons, quizzes, questions, images, videos, and programs. Assert that every external instructional lesson has `include_in_preview = 1`. Query Recruitment before and after installation and compare name, title, published flag, chapter children, and modified timestamp.

- [ ] **Step 4: Run the draft installation twice**

Run:

```bash
bench --site eben.isambane.co.za execute frappe_sign.training.install.install_all --kwargs '{"media_root":"/tmp/frappe-sign-training-media/rendered","publish":false}'
bench --site eben.isambane.co.za execute frappe_sign.training.install.install_all --kwargs '{"media_root":"/tmp/frappe-sign-training-media/rendered","publish":false}'
```

Expected: both calls return the same four course names and one program name; record counts do not increase on the second call.

- [ ] **Step 5: Verify the draft installation**

Run:

```bash
bench --site eben.isambane.co.za execute frappe_sign.training.verify.verify_installation --kwargs '{"expect_published":false}'
```

Expected: `ok` is true and `errors` is empty.

- [ ] **Step 6: Publish only after draft verification passes**

Run:

```bash
bench --site eben.isambane.co.za execute frappe_sign.training.install.install_all --kwargs '{"media_root":"/tmp/frappe-sign-training-media/rendered","publish":true}'
```

Expected: four course records and the program have `published = 1`.

- [ ] **Step 7: Verify the published installation and full regression suite**

Run:

```bash
bench --site eben.isambane.co.za execute frappe_sign.training.verify.verify_installation --kwargs '{"expect_published":true}'
bench --site eben.isambane.co.za run-tests --app frappe_sign
```

Expected: verifier `ok` is true with no errors; test command exits 0.

- [ ] **Step 8: Commit the verifier**

```bash
git add frappe_sign/training/verify.py frappe_sign/training/tests/test_verify.py
git commit -m "test: verify live Frappe Sign training installation"
```

---

### Task 9: Verify the Learner Experience and Preserve Evidence

**Files:**
- Create: `docs/training/frappe-sign/live-verification.md`
- Create on site: four LMS course export ZIP files or one manifest listing their private export paths and SHA-256 hashes

**Interfaces:**
- Consumes: the published live installation.
- Produces: learner-side evidence, prerequisite evidence, export backups, and the final handoff report.

- [ ] **Step 1: Create a disposable LMS learner**

Create `training.learner@example.invalid`, give it LMS Student access only, enroll it in the ordered program, and record the prefixed enrollment records for cleanup.

- [ ] **Step 2: Verify every course and lesson in the learner UI**

Use Playwright at 1920×1080 to open every course, traverse every chapter and lesson, and assert there are no broken images/videos, client exceptions, empty bodies, or unresolved quiz blocks. Record course URLs and counts in `live-verification.md` without storing an authenticated cookie or token.

- [ ] **Step 3: Verify quiz mastery behaviour**

On one quiz in each course, submit an intentionally incorrect answer and confirm progression remains blocked. Submit correct answers to obtain 100% and confirm the next lesson unlocks. Verify the attempt counter allows another attempt and reports a maximum of 20.

- [ ] **Step 4: Verify ordered-program prerequisites**

Confirm the learner cannot start Requestors before completing Internal Signers and cannot start Managers before completing Requestors. Complete the required courses with controlled test submissions and confirm the next course unlocks in sequence. Confirm the external course is absent from the program.

- [ ] **Step 5: Verify link-only course assumptions**

Open the external course in a fresh anonymous browser context and confirm every instructional lesson marked `include_in_preview = 1` is readable. Review every external-course lesson and confirm instructions begin from the emailed link, never require Desk, never encourage forwarding the link, and clearly cover consent, expiry, decline, and support. Confirm tracked quiz attempts and completion history still require an LMS login.

- [ ] **Step 6: Export and hash the published courses**

Use `lms.lms.course_import_export.export_course_zip` for each course, capture the resulting export File/path, and record its SHA-256 in the verification report. Do not commit ZIP binaries.

- [ ] **Step 7: Confirm unrelated LMS content is unchanged**

Compare the Recruitment course snapshot captured by the verifier with its final values. Expected: identical record identity, publication state, chapters, and modified timestamp.

- [ ] **Step 8: Remove the disposable learner and test activity**

Delete only `training.learner@example.invalid` and the prefixed enrollments, progress, quiz submissions, and program membership created in this task. Do not remove published course records or uploaded course media.

- [ ] **Step 9: Run final verification commands**

Run:

```bash
git diff --check
bench --site eben.isambane.co.za execute frappe_sign.training.verify.verify_installation --kwargs '{"expect_published":true}'
bench --site eben.isambane.co.za run-tests --app frappe_sign
rg -n '100|20|Internal Signers|Requestors|Managers|External and Link-Only Signers' docs/training/frappe-sign/live-verification.md
```

Expected: clean diff check; verifier `ok` true with no errors; full test suite exit 0; verification report contains the assessment rules and all four course titles.

- [ ] **Step 10: Commit the verification evidence**

```bash
git add docs/training/frappe-sign/live-verification.md
git commit -m "docs: verify published Frappe Sign role training"
```

- [ ] **Step 11: Prepare the final handoff**

Report the four course URLs, ordered-program URL, exact course/chapter/lesson/quiz/media counts, test results, audit findings by severity, media/export hashes, any explicitly documented limitations, and confirmation that the Recruitment course remained unchanged.
