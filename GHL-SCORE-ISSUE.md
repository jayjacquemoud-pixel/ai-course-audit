# GHL score issue — diagnosis & fix (AI Course Audit)

**Date:** 2026-08-17
**Reported by:** Jay — "They're hitting the audit and nothing is registering with the score. Devion is getting AI Course Audits without any scores populating in the contact, or the text message alert."
**Workflow in question:** https://app.gohighlevel.com/v2/location/5IhdlYzc3DlT022CwekG/automation/workflow/5af68dc6-a107-4976-872d-92f2c4560c01

---

## TL;DR

The tool **is** sending the scores correctly. The problem is on the **GHL side**: the workflow is almost certainly acting on the *first* of two webhook events (the "start" ping, which has no scores), not the *second* one (the "complete" ping, which carries all the scores).

**No code change required in this repo.** The fix is in the GHL workflow configuration.

---

## How the tool posts to GHL (verified live, 2026-08-17)

The tool fires **two** POSTs to the GHL inbound webhook (via `functions/api/submit-lead.js`) for each lead:

### 1. On audit START — `stage: "started_audit"` (NO scores)
```json
{
  "submittedAt": "2026-08-17T17:58:08.053Z",
  "name": "Diag Test",
  "email": "diag@example.com",
  "phone": "7025550000",
  "stage": "started_audit",
  "utm_source": "DIAG", "utm_medium": "diag",
  "utm_campaign": "score-check", "utm_content": "diag"
}
```

### 2. On audit COMPLETE — `stage: "completed_audit"` (HAS scores)
```json
{
  "submittedAt": "2026-08-17T17:58:15.386Z",
  "name": "Diag Test",
  "email": "diag@example.com",
  "phone": "7025550000",
  "stage": "completed_audit",
  "utm_source": "DIAG", "utm_medium": "diag",
  "utm_campaign": "score-check", "utm_content": "diag",
  "company": "Diag Co",
  "industry": "Diag Co",
  "audience": "Frontline / operations staff",
  "goal": "Compliance / consistency",
  "courseTitle": "Diag Co",
  "overallScore": 17,
  "score_courseStructure": 50,
  "score_contentQuality": 50,
  "score_learnerEngagement": 0,
  "score_knowledgeRetention": 0,
  "score_assessmentStrategy": 0,
  "score_aiReadiness": 0,
  "score_mobileLearning": 50,
  "score_reportingAnalytics": 0,
  "score_scalability": 0
}
```

The score fields are sent as **flat top-level keys** (`score_<category>`) on purpose — GHL's inbound webhook only auto-detects flat keys as individually mappable fields. See the comment in `index.html` `generateReport()` (~line 721).

> Note: `overallExperience` has no `score_` field — it is represented by `overallScore`.

---

## Root cause (ranked)

The scores reach GHL, but only in the **second** event. The workflow is reacting to the **first** event (no scores). Most likely one or both of:

1. **Workflow re-entry is OFF (GHL default).** The `started_audit` event arrives first and "uses up" the contact's single entry into the workflow. The `completed_audit` event (with scores) is then **skipped**, so scores never get written and Devion's SMS goes out on the scoreless start event.

2. **The Inbound Webhook sample was captured from a `started_audit` payload.** GHL only exposes fields that were present in the captured sample. If the sample had no `score_*` keys, those fields can't be mapped → they resolve to blank on the contact and in the SMS.

---

## The fix (in the GHL workflow — Doug/Jay to apply)

1. **Filter the trigger to `stage = completed_audit`.**
   In the Inbound Webhook trigger, add a filter so the workflow only fires when `stage` equals `completed_audit`. This guarantees scores exist when it runs, and stops the scoreless `started_audit` event from consuming the entry. (This single change fixes both the empty contact fields and the scoreless alert.)

2. **Re-capture the webhook sample using a COMPLETED event**, then map the score fields.
   Send one completed audit, capture that request as the sample, then map each of these to a contact custom field:
   `overallScore`, `score_courseStructure`, `score_contentQuality`, `score_learnerEngagement`, `score_knowledgeRetention`, `score_assessmentStrategy`, `score_aiReadiness`, `score_mobileLearning`, `score_reportingAnalytics`, `score_scalability`.

3. **Use those mapped fields as merge tags in Devion's SMS.**

Optional cleanup: if a separate/duplicate workflow is also triggering on the start event, disable or filter it the same way.

---

## Related open items (context)

- **PR #1** — fixes report generation returning 502 ("AI response was not valid JSON"); the report was falling back to the generic narrative. *Unrelated to the score issue* — the `completed_audit` lead+scores fire before report generation, so scores are sent even when the report failed.
- **PR #2** — updates the two report CTAs (Book a 15-Minute Demo → `experts-bac`; Get a Free 14-Day Trial → `experts-trial`).
- **Test contacts to delete in GHL:** `TEST — ignore (UTM check)` (`doug-utm-test-ignore@lsvt-test.com`) and `TEST Diagnostic (ignore)`.

## How this was verified

Ran the audit end-to-end against the deployed worker (`ai-course-audit.jaylsvt.workers.dev`) with the outbound `submit-lead` request intercepted, capturing the exact payloads above. UTM passthrough (GHL page → iframe → tool → webhook) was separately confirmed working, and both stages returned `{"ok":true}` from the live webhook, so `GHL_WEBHOOK_URL` is configured and GHL is accepting the posts.
