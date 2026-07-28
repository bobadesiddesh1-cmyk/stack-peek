# StackPeek — Privacy Policy

_Last updated: 2026_

**StackPeek collects no data. Everything happens locally in your browser.**

StackPeek is a browser extension that detects the web technologies a website is
built with (its CMS, frameworks, analytics, hosting, and similar tools) and
shows them in a side panel. It is designed to be completely private.

## What StackPeek does

- Detection runs **only when you click the StackPeek toolbar icon** — never
  automatically and never in the background.
- When you click the icon, StackPeek inspects **the current tab you are viewing**
  to read the information needed to identify its technologies: the page's HTML,
  its script and stylesheet URLs, known JavaScript global variables, non-HttpOnly
  cookie names, and the page's own same-origin HTTP response headers.
- All of this analysis happens **on your device, inside your browser**. The
  results are shown to you in the side panel and are not sent anywhere.

## What StackPeek does NOT do

- It does **not** collect, store, or transmit any personal information.
- It does **not** send the pages you visit, the technologies it detects, or any
  other data to StackPeek or to any third party.
- It has **no server, no account, no sign-in, and no analytics or telemetry.**
- It does **not** track your browsing, and it does **not** use cookies to
  identify you.
- It does **not** sell or share any data — because it does not collect any.

## Data stored on your device

For your convenience, StackPeek saves a small amount of information **locally on
your own device only**, using the browser's local storage:

- A history of your most recent detections (up to the last 20 sites) and the
  latest result, so the side panel can display them.

This information never leaves your device, is never synced across devices, and
is never uploaded. You can clear it at any time from the extension's History
tab, or by removing the extension.

## Network activity

StackPeek makes **no external network requests.** The only network request it
performs is a request to **the current page's own address** (same origin) to
read that page's HTTP response headers as part of detection. This request goes
to the site you are already viewing — not to StackPeek or any other party — and
no response body or personal data is stored or transmitted.

## Permissions

StackPeek requests the minimum permissions required for its single purpose:

- **activeTab** — read the current tab's content, only when you click the icon.
- **scripting** — run the detection code in the current tab, only on your click.
- **storage** — save the local history described above on your device.
- **sidePanel** — display the results in the browser's side panel.

StackPeek requests **no host permissions** and has no access to sites you do not
explicitly scan.

## Changes to this policy

If this policy changes, the updated version will be published at this same
location with a new "Last updated" date.

## Contact

Questions about privacy can be raised via the project's issue tracker on GitHub.
