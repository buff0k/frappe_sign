# Frappe Sign Role-Based Training and Audit Design

## Purpose

Audit the current Frappe Sign application and populate the LMS on
`eben.isambane.co.za` with four role-specific courses that teach people to use
the application safely and correctly. The training must reflect the behaviour
of the installed application rather than generic electronic-signature advice.

The deliverables are:

1. A written application audit.
2. Four populated LMS courses with lessons, captioned videos, annotated
   screenshots, transcripts, and quizzes.
3. An ordered LMS program that enforces the progression required for internal
   requestors and managers.
4. A verification report covering the records, media, navigation, assessment
   settings, and prerequisite behaviour.

This work does not include changing Frappe Sign application behaviour. Any
defects or improvement opportunities found during the audit will be reported
separately rather than silently fixed.

## Audience and Course Architecture

Create these independent courses:

1. **Frappe Sign for Internal Signers**
2. **Frappe Sign for Requestors**
3. **Frappe Sign for Managers**
4. **Frappe Sign for External and Link-Only Signers**

Create an LMS Program named **Frappe Sign Role Progression** with enforced
course order:

1. Frappe Sign for Internal Signers
2. Frappe Sign for Requestors
3. Frappe Sign for Managers

The External and Link-Only Signers course remains outside the ordered program.
It must be understandable without Desk access or prior course completion.

All courses enforce lesson completion in sequence. Repeated foundational
material is kept brief and role-specific so that each course remains coherent
when viewed on its own.

## Course 1: Frappe Sign for Internal Signers

### Learning outcomes

Learners will be able to locate assigned documents, maintain their signature
profile, review the electronic-signature notice, complete all assigned fields,
sign or decline a request, and understand what evidence is produced after
completion.

### Chapters and lessons

1. **Your role in Frappe Sign**
   - What an internal signer is
   - Request states and signing order
   - Ordinary electronic signatures and consent
2. **Access and profile**
   - Opening assigned documents from Desk and the documents page
   - Creating or updating a signature profile
   - Drawing, typing, or uploading a signature and initials
3. **Review and sign**
   - Opening a signing request safely
   - Reviewing the complete document
   - Completing signature, initials, name, email, date, text, and checkbox fields
   - Confirming consent and submitting
4. **Exceptions and completion**
   - Declining with a reason
   - Expired, cancelled, or unavailable requests
   - What happens after the final signer completes the request
   - Awareness of signed-PDF attachment and automatic source submission
5. **Assessment**
   - Scenario review
   - Final quiz

This course explains automatic attachment and submission only as an outcome.
It does not teach learners to create or configure signing requests.

## Course 2: Frappe Sign for Requestors

### Prerequisite

Completion of **Frappe Sign for Internal Signers** through the ordered program.

### Learning outcomes

Learners will be able to create, prepare, send, monitor, resend, cancel, and
close out signing requests from uploaded PDFs and Frappe documents.

### Chapters and lessons

1. **Requestor responsibilities**
   - Request lifecycle and requestor permissions
   - Choosing an appropriate document and signer set
   - Parallel versus sequential signing, including signing cohorts
2. **Create the source request**
   - Creating a request from an uploaded PDF
   - Creating a request from a configured Frappe DocType
   - Choosing a source record and print format
   - Expiry and request title
3. **Configure signers and fields**
   - Adding internal and permitted external signers
   - Assigning parallel or sequential signing order
   - Using the visual designer
   - Assigning all supported field types to the correct signer
4. **Automate source completion**
   - Enabling **Attach Signed PDF to Source**
   - Selecting the target Attach field
   - Enabling **Submit Source on Completion**
   - Preconditions and risks of automatic submission
   - Verifying the signed attachment and submitted source record
5. **Send and monitor**
   - Sending a prepared request
   - Copying a signer link safely
   - Resending links
   - Monitoring viewed and partially signed states
   - Cancelling an unconcluded request
6. **Close-out and evidence**
   - Retrieving the signed PDF and audit certificate
   - Reviewing events and evidence certificates
   - Running tamper verification
   - Handling declined, expired, failed, and cancelled requests
7. **Assessment**
   - End-to-end request scenario
   - Final quiz

## Course 3: Frappe Sign for Managers

### Prerequisites

Completion of both preceding courses in the ordered program:

1. Frappe Sign for Internal Signers
2. Frappe Sign for Requestors

### Learning outcomes

Learners will be able to govern access, configure signing behaviour, enable
safe document sources, maintain templates and certificates, validate evidence,
and troubleshoot operational failures.

### Chapters and lessons

1. **Governance and legal positioning**
   - Manager responsibilities and role boundaries
   - Ordinary electronic signatures under the stated South African positioning
   - When legal or compliance review is required
2. **Roles and access**
   - Frappe Sign Manager, Sender, User, and Signer roles
   - Internal and external signer access
   - Request visibility and creator/signer permissions
3. **Global settings**
   - Enabling the application
   - Internal-only versus external signers
   - Login requirements, expiry, reminders, and consent
   - Audit-certificate append and tamper-detection settings
4. **Source documents and automation**
   - Configuring allowed source DocTypes and print formats
   - Selecting suitable Attach fields
   - Governing automatic attachment and source submission
   - Testing a source-document workflow before release
5. **Templates and operating standards**
   - Building and maintaining reusable templates
   - Template signers and fields
   - Parallel, sequential, and cohort signing standards
6. **Certificates and validation**
   - Self-signed versus CA-issued document-signing certificates
   - Certificate metadata, validity, and password handling
   - Audit certificates, hashes, event chains, and final verification PDFs
   - Using the validator and interpreting tamper status
7. **Operations and troubleshooting**
   - Monitoring requests and evidence
   - Cancelling requests within authority
   - Diagnosing delivery, access, rendering, field, and completion failures
   - Escalation and evidence preservation
8. **Assessment**
   - Governance scenario review
   - Final quiz

## Course 4: Frappe Sign for External and Link-Only Signers

### Learning outcomes

Learners will be able to use an emailed signing link safely without Desk
access, review and sign the assigned document, decline when appropriate, and
protect the unique link.

### Chapters and lessons

1. **Before opening the link**
   - Recognising the invitation
   - Treating the unique link as sensitive
   - Expiry, cancellation, and obtaining help
2. **Review the request**
   - Opening the link without Desk
   - Confirming the document and request context
   - Reviewing the electronic-signature notice and consent
3. **Complete the document**
   - Creating or supplying a signature and initials when prompted
   - Completing every assigned field
   - Reviewing and submitting the signed document
4. **Decline or resolve a problem**
   - Declining with a clear reason
   - Handling expired, used, invalid, or inaccessible links
   - Contacting the requestor without forwarding the signing link
5. **After signing**
   - Completion confirmation
   - Accessing available final documents
   - Basic validation and fraud-awareness guidance
6. **Assessment**
   - Link-security scenario review
   - Final quiz

The course content should be publicly viewable where supported by the installed
LMS. LMS completion tracking and quiz history may require an LMS website user;
the instructional content must not assume that the learner has Desk access.

## Assessments

Every graded knowledge check and final quiz uses:

- Passing percentage: **100%**
- Maximum attempts: **20**
- Answers and explanations displayed after submission
- Submission history enabled
- No negative marking
- Lesson progression blocked until the required quiz is passed

Questions should test decisions and safe behaviour rather than obscure labels.
Each lesson-level check should contain three to five questions. Each final quiz
should contain ten to fifteen questions spanning the complete course.

Questions may be reused conceptually across courses, but wording must reflect
the learner's role. Incorrect-answer explanations must direct the learner back
to the relevant rule or workflow.

## Media Production

### Videos

- Use the real installed Frappe Sign interface and fictional training records.
- Produce short 1080p MP4 screen recordings focused on one task each.
- Use burned-in captions; do not use narration.
- Keep cursor movement deliberate and avoid unnecessary waiting or navigation.
- Mask or exclude tokens, passwords, private file URLs, personal data, and
  production-sensitive records.
- Store videos as LMS-supported uploaded video blocks so the course does not
  depend on an external video platform.
- Provide a text transcript directly in the associated lesson.

### Screenshots

- Capture the installed interface at a readable desktop size.
- Crop to the relevant context while retaining enough navigation for orientation.
- Add numbered callouts or restrained highlights where they clarify a choice.
- Provide descriptive captions and alternative text.
- Never expose signing tokens, certificate passwords, or real personal data.

### Training records

Use obviously fictional people, email addresses, companies, and documents.
Demonstrations that alter request state must use dedicated training records.
Training requests must not send messages to real recipients.

## Application Audit

The audit will compare code, DocType metadata, client actions, permissions,
portal behaviour, README/API documentation, and observed live behaviour. It
will cover:

- Feature inventory and status transitions
- Role and record-level permission boundaries
- Internal, external, and link-only access paths
- Source-document and print-format integration
- Parallel, sequential, and cohort signing
- Field placement and signing behaviour
- Notifications, reminders, link handling, cancellation, and decline behaviour
- Signed files, audit certificates, hashes, event chains, certificate evidence,
  and tamper validation
- Settings, certificate management, and source DocType configuration
- Error states, usability hazards, documentation discrepancies, and training
  implications

Findings will be classified by severity and confidence. Each finding will cite
the relevant file, metadata, test, or observed workflow. The audit will avoid
claiming legal certification or accreditation.

## Population and Idempotency

Populate the live LMS without modifying the existing Recruitment course.
Course creation should be repeatable by using stable course titles and checking
for existing records before insertion. Media filenames should use a consistent
course and lesson prefix.

Publish records only after their chapters, lessons, media, and assessments have
been validated. Create the ordered program after all three internal courses
exist. Preserve an export or manifest sufficient to identify every record and
media file created by this work.

## Verification

Verification must include:

1. Confirming that all four courses exist, are published, and contain the
   intended ordered chapters and lessons.
2. Confirming that every uploaded image and MP4 resolves successfully.
3. Reviewing each lesson in the LMS learner interface.
4. Confirming captions, transcripts, screenshot readability, and absence of
   production-sensitive information.
5. Confirming every quiz has a 100% pass mark, 20 attempts, answer feedback,
   and the intended question count.
6. Demonstrating that an incorrect result blocks progress and that a 100%
   result completes the assessment.
7. Confirming enforced lesson order within each course.
8. Confirming ordered program progression from Internal Signer to Requestor to
   Manager.
9. Confirming that the external course does not assume Desk access.
10. Confirming that the existing Recruitment course and unrelated LMS records
    remain unchanged.
11. Comparing the completed records and media against this specification and
    reporting any gaps explicitly.

## Out of Scope

- Altering Frappe Sign permissions or workflow behaviour
- Providing legal advice or representing the product as an accredited Advanced
  Electronic Signature service
- Sending real signing requests or training notifications
- Publishing media to external video platforms
- Reworking unrelated LMS content
