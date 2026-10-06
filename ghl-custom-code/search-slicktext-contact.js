// search-slicktext-contact.js
// ---------------------------------------------------------------------------
// Author:  Jibril Sulaiman
// Date:    2026-04-23 (published 2026-10-06)
// Deploy:  GoHighLevel workflow > Custom Code action (Javascript), named
//          "Search Contacts" (README Step 4b). Paste the whole file.
// What:    Looks the contact up in SlickText by mobile number and returns whether
//          they exist, plus their SlickText contact id and opt-in status, so the
//          workflow can branch: add an existing contact to a list, or create one first.
// Why:     SlickText's search response is an array, which GHL's webhook variable
//          picker handles badly (the step number is baked into the merge tag).
//          Doing the lookup in code returns flat outputs any later step can use.
//          GHL custom code has no fetch, axios or require; customRequest is the
//          HTTP client it provides.
// ---------------------------------------------------------------------------
//
// Inputs (Property To Include In Code):
//   phone    {{contact.phone_raw}}
//   api_key  your SlickText API key (see README Step 1 on where to keep it)
//
// Replace REPLACE_WITH_BRAND_ID with your SlickText brand id (the number after /b in
// your SlickText dashboard URL).

const phone = inputData.phone;
const apiKey = inputData.api_key;

const getResponse = await customRequest.get(`https://dev.slicktext.com/v1/brands/REPLACE_WITH_BRAND_ID/contacts?mobile_number=${encodeURIComponent(phone)}`,{headers:{'Accept':'application/json','Authorization':`Bearer ${apiKey}`}});

const contact = getResponse.data && getResponse.data.data && getResponse.data.data.length > 0 ? getResponse.data.data[0] : null;

return {exists: contact ? "true" : "false", contact_id: contact ? String(contact.contact_id) : "", first_name: contact ? contact.first_name : "", last_name: contact ? contact.last_name : "", opt_in_status: contact ? contact.opt_in_status : ""};
