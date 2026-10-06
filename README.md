<!--
  README.md -- GoHighLevel -> SlickText SMS list sync and campaign scheduler
  Author:  Jibril Sulaiman
  Date:    2026-10-06
  What:    Click-by-click guide for two GoHighLevel workflows: one puts each new
           registrant on the right SlickText list (finding or creating the SlickText
           contact first), the other schedules a whole SMS sequence from one class
           date, converted to the UTC times SlickText expects.
  Why:     There is no GHL-SlickText integration, SlickText has no single
           "create and add to list" call, its search response is an array GHL handles
           badly, and its campaign times are UTC, so Eastern times sent raw fire hours
           early.
-->

# GoHighLevel → SlickText: list sync and SMS campaign scheduler

Two GoHighLevel (GHL) workflows that run a free-class SMS program in
[SlickText](https://www.slicktext.com/) with no Zapier in between:

1. **List sync.** When someone registers, a custom code step looks them up in SlickText
   by phone. Existing contacts are added to the class's SMS list; new ones are created
   first. Their SlickText id is saved on the GHL contact.
2. **Campaign scheduler.** One class date, kept in a GHL custom value, becomes a
   nine-message sequence. A custom code step converts each Eastern send time to UTC
   (correct across daylight saving), and nine webhook steps create the campaigns in
   SlickText, scheduled and pointed at the class's list.

The list codes and dates live in GHL **custom values**, so the next class is a matter
of editing a few values, not editing workflows.

## Why it exists

- **There's no GHL ↔ SlickText integration.** Everything goes through GHL's **Custom
  Webhook** and **Custom Code** actions against SlickText's API.
- **SlickText has no "create and add to list" call.** It's always two requests: create
  (or find) the contact, then add it to a list.
- **SlickText's search response is an array.** `GET /contacts?mobile_number=...` returns
  `{ "data": [ {...} ] }`. GHL can read it from a webhook step
  (`{{custom_webhook.3.response.body.data.0.contact_id}}`), but the step number is baked
  into the merge tag, so reordering the workflow breaks it. A custom code step returns
  flat outputs instead.
- **GHL custom code has no `fetch`, `axios` or `require`.** Its HTTP client is the
  `customRequest` global; code written for Node won't run.
- **SlickText reads campaign `scheduled` times as UTC.** A 7pm Eastern send typed as
  `19:00:00` fires at 2pm or 3pm. Setting the SlickText brand to Eastern works until
  daylight saving changes; converting in the workflow doesn't depend on a setting.

## How it works

```text
 Workflow A: registration                      Workflow B: one class date → 9 SMS
 ───────────────────────                       ──────────────────────────────────
 Trigger: registers for the class             Trigger: run once per class
   │                                             │
 Custom Code "Search Contacts"                 Custom Code: class_date_et → utc_1 ... utc_9
   GET /contacts?mobile_number=...               │   (Eastern wall time → UTC, DST-aware)
   → exists, contact_id                          │
   │                                           Custom Webhook ×9: POST /campaigns/
 Condition: exists = "true"?                     "scheduled": "{{custom_code.1.output.utc_N}}"
   ├─ yes ─► Update contact: slicktext_id        "contact_lists": [ <class list code> ]
   └─ no ──► Custom Webhook: POST /contacts (create)
             Update contact: slicktext_id from the response
   │
 Custom Webhook: POST /lists/contacts
   [ { "contact_id": ..., "lists": [ ... ] } ]
```

## What's in this repo

| Path | What it is | Where it goes |
|---|---|---|
| [`ghl-custom-code/`](ghl-custom-code/) | The two Custom Code steps | GHL workflow **Custom Code** actions (Steps 4 and 6) |
| [`webhook-bodies/`](webhook-bodies/) | The raw JSON bodies for the three Custom Webhook calls | GHL **Custom Webhook** actions (Steps 4 and 6) |
| [`test/`](test/) | Runs both code steps the way GHL does, with SlickText faked | `npm test` |

## Table of contents

- [1. Requirements](#1-requirements)
- [2. Setup, step by step](#2-setup-step-by-step)
  - [Step 1: SlickText API key and brand id](#step-1-slicktext-api-key-and-brand-id)
  - [Step 2: Custom values for the class](#step-2-custom-values-for-the-class)
  - [Step 3: A contact field for the SlickText id](#step-3-a-contact-field-for-the-slicktext-id)
  - [Step 4: Workflow A, list sync](#step-4-workflow-a-list-sync)
  - [Step 5: Test the list sync](#step-5-test-the-list-sync)
  - [Step 6: Workflow B, campaign scheduler](#step-6-workflow-b-campaign-scheduler)
  - [Step 7: Test the schedule](#step-7-test-the-schedule)
- [SlickText API notes](#slicktext-api-notes)
- [Troubleshooting](#troubleshooting)
- [Limits](#limits)
- [Security](#security)

## 1. Requirements

| Need | Why |
|---|---|
| A GoHighLevel sub-account with workflows, **Custom Webhook** and **Custom Code** | Both workflows. Custom Code is a premium action: *"Using this action will incur additional charges per execution."* |
| A SlickText account on the current API (`dev.slicktext.com/v1/brands/<id>/...`, bearer key) | Every call. The legacy `api.slicktext.com/v1` API uses different auth and isn't covered. |
| Node.js 20+ (optional) | Only to run the tests |

## 2. Setup, step by step

### Step 1: SlickText API key and brand id

About 5 minutes.

**1a.** In SlickText, create an API key for this integration (production named it
`GHL`) on the API keys page (wording may differ). Copy it.

**1b.** Your **brand id** is the number after `/b` in your SlickText dashboard URL
(`https://app.slicktext.com/b<brand id>/...`). Replace `REPLACE_WITH_BRAND_ID` with it
in [`ghl-custom-code/search-slicktext-contact.js`](ghl-custom-code/search-slicktext-contact.js),
and use it in every webhook URL below.

**1c.** Every SlickText call sends these headers:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <your API key>` |
| `Accept` | `application/json` |
| `Content-Type` | `application/json` (POST and PUT) |

> ⚠️ **A 401 means the key or the API version.** A key for the current API sent to the
> legacy `api.slicktext.com` host, or a key without `Bearer `, returns *401
> Unauthorized*.

✅ **Check:** you have the key and the brand id.

### Step 2: Custom values for the class

About 10 minutes.

**2a.** In GHL, open **Settings → Custom Values** and make a folder for the class (for
example **Free Class Custom Values**).

**2b.** Add one custom value per SlickText list, holding the list's numeric id. Use
**Edit Custom Value**: **Name**, **Value**, **Folder**, then **Update**. Production used:

| Name | Merge tag | Value |
|---|---|---|
| SlickText List Code – Free Class Registration | `{{custom_values.slicktext_list_code__free_class_registration}}` | e.g. `100001` |
| SlickText List Code – Attended / Did Not Attend / Watched Replay | one per group | list ids |

**2c.** Add the class date the scheduler reads, for example **Slicktext #1 Campaign
Date Time** with a value like `2026-02-25 19:00:00` (Eastern; only the date part is used).

> ⚠️ **An empty custom value breaks the JSON.** GHL renders it as nothing, so
> `"lists": [ {{custom_values...}} ]` becomes `"lists": [ ]` or a bad name, and SlickText
> returns 422. Fill every value before testing, and insert merge tags with the **Custom
> Values** picker in the body editor rather than typing them.

✅ **Check:** every list code and the class date have a value.

### Step 3: A contact field for the SlickText id

About 3 minutes.

**3a.** Create a contact custom field **SlickText Contact ID** (text). Its merge tag is
`{{contact.slicktext_id}}` (match whatever key GHL gives yours).

Storing the id on the contact is what keeps the rest simple: every later list call reads
a normal contact field instead of parsing a SlickText response.

✅ **Check:** the field shows on a contact record.

### Step 4: Workflow A, list sync

About 30 minutes. Name it, for example, `Update Slicktext List Register`.

**4a. Trigger.** Whatever marks a registration for the class: a form submission or a
tag being added.

**4b. Custom Code: Search Contacts.** Add **Custom Code**. **Action Name:** `Search
Contacts`. **Language:** Javascript.
1. **Property To Include In Code** (*"Use inputData.keyName or inputData['keyName'] to
   access the values within the code."*):

   | Key | Value |
   |---|---|
   | `phone` | `{{contact.phone_raw}}` |
   | `api_key` | your SlickText key (see [Security](#security)) |

2. Delete the sample code and paste in **all** of
   [`ghl-custom-code/search-slicktext-contact.js`](ghl-custom-code/search-slicktext-contact.js).
3. Click **Test Your Code**. *"Testing the code is mandatory. No output will be
   available for untested code in subsequent action."* The outputs it returns:

   | Output | Value |
   |---|---|
   | `exists` | `"true"` or `"false"` (strings) |
   | `contact_id` | SlickText contact id, or `""` |
   | `first_name`, `last_name`, `opt_in_status` | From SlickText, or `""` |

4. **Save Action**.

> ⚠️ **"Custom value will not be passed when you are testing your code."** If a test
> needs a value that comes from a custom value, type a literal into the property for
> the test, then put the merge tag back.

> ⚠️ **No `fetch`.** An earlier version of this step used `fetch` and failed: GHL's
> runtime doesn't have it. `customRequest.get(url, { headers })` is the client GHL
> provides, and its JSON is under `.data`.

**4c. Condition.** Add **Condition**, **Scenario recipe:** **Build Your Own**. One branch,
named for example **Contact Found**: the Search Contacts output `exists` **Equal to**
`true`. Everything else goes to the **None Branch** (*"When no condition is met"*).
(Picker wording for custom code outputs may differ.)

**4d. Contact Found branch.** **Update Contact Field**: **SlickText Contact ID** = the
Search Contacts `contact_id` output.

**4e. None branch: create the contact.**
1. **Custom Webhook**, name it `Create Contact – Webhook`: **POST**
   `https://dev.slicktext.com/v1/brands/<brand id>/contacts`, headers from Step 1c,
   **Content-Type** `application/json`, **Raw Body** = all of
   [`webhook-bodies/create-contact.json`](webhook-bodies/create-contact.json).
2. Tick **Save response from this Webhook** and click **Test**. You should see
   *"Request success with status: 200"* (or 201) and a flat body with `contact_id`.
3. **Update Contact Field**: **SlickText Contact ID** = that webhook's response
   `contact_id`.

**4f. Both branches: add to the list.** **Custom Webhook**, `Add to List – Webhook`:
**POST** `https://dev.slicktext.com/v1/brands/<brand id>/lists/contacts`, **Raw Body** =
all of [`webhook-bodies/add-to-list.json`](webhook-bodies/add-to-list.json). Replace
`REPLACE_WITH_BASE_LIST_ID` with an all-subscribers list id, or delete it to add to the
class list only.

> ⚠️ **The body must be an array of objects.** One object, or the plausible-looking
> `{"contact_ids": [...], "list_ids": [...]}`, returns *"Request failed with status:
> 400"* and body `"Bad Request"`. The working shape is
> `[ { "contact_id": 1111, "lists": [1000, 1001] } ]`, one object per contact.

> ⚠️ **No trailing commas.** A trailing or leading comma inside the raw body comes back
> from SlickText as a 422, not as a JSON error from GHL.

**4g.** Publish the workflow (**Draft** → **Publish**).

✅ **Check:** the workflow is published and every webhook step has a saved test response.

### Step 5: Test the list sync

About 10 minutes.

**5a.** Register a test contact (your own phone) through the real trigger.

**5b.** In the workflow's **Execution Logs**, each step shows its result; the Add to List
step shows status 200.

**5c.** In SlickText, open the list from Step 2b: the contact is on it. In GHL, the
contact's **SlickText Contact ID** is filled.

**5d.** Register the same person again: the run goes down **Contact Found**, no
duplicate contact appears in SlickText, and nothing returns 400.

✅ **Check:** one SlickText contact, on the right list, with its id on the GHL contact.

### Step 6: Workflow B, campaign scheduler

About 45 minutes. Name it, for example, `Create Slicktext Messages`.

**6a. Trigger.** Whatever you use to start a class's sequence once (a manual enrollment
of one internal contact works).

**6b. Custom Code: the send times.** Add **Custom Code** as the **first** action.
1. **Property To Include In Code:** `class_date_et` = the class date custom value from
   Step 2c.
2. Paste in **all** of
   [`ghl-custom-code/campaign-send-times.js`](ghl-custom-code/campaign-send-times.js).
   Edit the times under `Build schedule` to your sequence (production: day before 10am;
   class day 10am, 4pm, 6:45pm, 8:30pm; next day 10am and 6:50pm; two days later 10am).
3. Click **Test Your Code**. Because custom values aren't passed to tests, put a literal
   date in the property first (for example `2026-02-12`), check `utc_1` ... `utc_9`,
   then put the custom value back.

> ⚠️ **ES5 only.** GHL's runtime rejected optional chaining (`?.`) in this step, which is
> why the code uses `var`, plain functions and a loop instead of `.find(...)?.value`.

**6c. Nine campaign webhooks.** For each message, add **Custom Webhook**: **POST**
`https://dev.slicktext.com/v1/brands/<brand id>/campaigns/`, headers from Step 1c,
**Raw Body** from
[`webhook-bodies/create-campaign.json`](webhook-bodies/create-campaign.json) with:

| Field | Set to |
|---|---|
| `name` | `#N` plus the list code (or any label) |
| `body` | Your message. Line breaks are `\n\n` inside the string; a real line break breaks the JSON. |
| `status` | `scheduled` |
| `scheduled` | `{{custom_code.1.output.utc_N}}` for message N |
| `audience.contact_lists` | The class's list code custom value, unquoted (it's a number) |

> ⚠️ **The merge tag includes the step number.** Production's custom code was step 1,
> so its outputs were `{{custom_code.1.output.utc_1}}` ... `utc_9`. If you add steps
> above it, the number changes. Pick the value from the merge-tag picker to be sure.

**6d.** Publish.

✅ **Check:** the workflow has the custom code first and nine webhooks, each with a
different `utc_N`.

### Step 7: Test the schedule

About 10 minutes.

**7a.** Set the class date custom value to a real upcoming date and run Workflow B once.

**7b.** In SlickText's campaigns list, open message #1: its scheduled time reads the
Eastern time you meant (for example 10:00 AM), not four or five hours earlier.

**7c.** Check a class on the other side of a daylight-saving change (March or November):
the offset changes by itself. `npm test` covers this case too.

**7d.** Delete or unschedule the test campaigns if the date was only for testing.

✅ **Check:** nine campaigns, each at the intended Eastern time, each targeting the
class list.

## SlickText API notes

| Call | Method and path | Body | Notes |
|---|---|---|---|
| Find contact | `GET /v1/brands/<id>/contacts?mobile_number=%2B1...` (or `email=`) | — | Search is *list contacts* with filters. Encode `+` as `%2B`. Response is `{ data: [...] }`. |
| Create contact | `POST /v1/brands/<id>/contacts` | [`create-contact.json`](webhook-bodies/create-contact.json) | Flat response with `contact_id`: the one SlickText response GHL's picker handles cleanly |
| Update contact | `PUT /v1/brands/<id>/contacts/<contact_id or exact stored mobile_number>` | same shape | `{{contact.phone_raw}}` is 10 digits; SlickText stores `+1...`, so use `{{contact.phone}}` or `+1{{contact.phone_raw}}` here, or get a 404 |
| Add to lists | `POST /v1/brands/<id>/lists/contacts` | [`add-to-list.json`](webhook-bodies/add-to-list.json) | Array of objects, one per contact |
| Create list | `POST /v1/brands/<id>/lists` | `{"name": "...", "description": "..."}` | A list per class can be created from a workflow too |
| Create campaign | `POST /v1/brands/<id>/campaigns/` | [`create-campaign.json`](webhook-bodies/create-campaign.json) | `scheduled` is UTC, `YYYY-MM-DD HH:mm:ss`. A campaign is the only way to send; for a one-off text, put the person on a one-member list and send a campaign to it. |

Responses carry rate-limit headers (`x-ratelimit`, `x-ratelimit-remaining`,
`x-ratelimit-reset`).

## Troubleshooting

| You got | Cause | Fix |
|---|---|---|
| 401 Unauthorized | Wrong key, missing `Bearer `, or the legacy host | Step 1 |
| 400 `"Bad Request"` on Add to List | Body not an array of objects | Step 4f |
| 422 on any POST | Trailing comma, or an empty custom value | Steps 2 and 4f |
| 404 on update | Phone without `+1` | SlickText API notes |
| Custom code test fails with `Missing inputData.class_date_et` | Custom values aren't passed to tests | Put a literal in for the test (Step 6b) |
| Custom code fails on `fetch` or `?.` | GHL runtime limits | Use `customRequest`; write ES5 (Steps 4b, 6b) |
| Campaigns fire hours early | Eastern times sent as UTC, or the wrong `utc_N` tag | Step 6 |
| A webhook reads an empty `contact_id` | The step that saves the response was reordered or untested | Re-test with **Save response from this Webhook** on; re-pick the merge tag |

## Limits

- **One contact per run.** This isn't a bulk backfill of existing GHL contacts.
- **Eastern only.** The converter is written for `America/New_York`; change `tz` for
  another zone.
- **Campaign copy lives in the webhook bodies.** Changing a message means editing the
  step, not a custom value (put the copy in custom values if it changes per class).

## Security

- **GHL custom code has no secret store.** A key typed into **Property To Include In
  Code** is visible to anyone who can open the workflow, and in any screenshot of that
  panel. Limit who can edit these workflows, never screenshot the panel, and rotate the
  key if it has been exposed.
- **Webhook headers hold the key too.** The same care applies to the Custom Webhook
  steps' `Authorization` header.
- **Test with your own number.** Workflow A subscribes real phone numbers to SMS lists.

---

Built by [Jibril Sulaiman](https://github.com/carljibrilsulaimanii).
