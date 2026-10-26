# Verified browser research workflow

Playwright 1.62.0 and system Chromium are installed. Use Python Playwright with `executable_path='/usr/bin/chromium'`; an additional browser download is unnecessary.

Reviewed Microsoft's official [locators guide](https://github.com/microsoft/playwright/blob/main/docs/src/locators.md) and [best practices](https://github.com/microsoft/playwright/blob/main/docs/src/best-practices-js.md). Prefer roles and accessible names for clicks, labels for inputs, Playwright's auto-waiting, and `expect(locator)` assertions. Save screenshots and inspect them rather than relying only on extracted text. Avoid treating a marketing page review as testing the signed-in product.

In this managed environment, preserve the inherited HTTP(S) proxy. Playwright's Chromium must receive the proxy explicitly. TLS verification stays enabled. If Chromium reports `ERR_CERT_AUTHORITY_INVALID`, import only the platform's existing `/usr/local/share/ca-certificates/environment-proxy-ca.crt` into Chromium's NSS trust database, following [Chromium's Linux certificate guidance](https://github.com/chromium/chromium/blob/main/docs/linux/cert_management.md). That CA is already trusted by the system tools. Do not use `ignore_https_errors` or certificate-error bypass flags. Certificate initialization outside writable roots requires the environment's supported escalation. Run the browser verification in the same approved execution session as certificate initialization; do not assume changes to the home-directory trust store persist across isolated command sessions.

Public pages successfully loaded and were inspected on 26 October 2026:

- https://wanderlog.com — 200; screenshot shows trip title/date, Share, Undo, reservations, and an itinerary/map split view.
- https://www.tripit.com/web — 200; categorized travel details and a single trip-organization entry point.
- https://roadtrippers.com — 200; prominent starting-point/destination inputs and explicit manual versus automatic planning.
- https://github.com/seanmorley15/AdventureLog — 200; project documentation and published interface screenshots.

These results supersede the earlier network-error observations for those public pages. Some routes or assets may still require separate network-policy entries; diagnose the actual failing URL. A certificate trust error, a network-policy denial, and an application's login requirement are distinct problems.

Research scripts, results, downloaded official guidance, and screenshots for this task are saved under `/workspace/scratch/browser-research/`.
