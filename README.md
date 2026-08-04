# ⚽ TJSB Official Website & Fanshop

A modern, lightning-fast, and fully serverless platform combining the official team presentation (match schedules, results) and a custom-built fanshop.

## Features
* **Club Hub:** Match schedules, team results, and general club information.
* **Fanshop:** Custom e-commerce platform with a shopping cart and order management.
* **Admin Dashboard:** Secured via Cloudflare Access (Zero Trust JWT authentication).
* **Automated Maintenance:** CRON jobs for canceling uncollected orders and purging old database records/audit logs.
* **Spam Protection:** Cloudflare Turnstile integration on the checkout form.
* **Dynamic Emails:** Automated transactional emails for order confirmations, cancellations, and pickup notices.

## Tech Stack

**Frontend:**
* HTML5 / CSS3 / Vanilla JS
* Vite

**Backend & Infrastructure (Cloudflare Ecosystem):**
* Cloudflare Pages (Frontend hosting)
* Cloudflare Workers & Hono (REST API routing)
* Cloudflare D1 (SQLite relational database)
* Cloudflare R2 (Object storage for product images).
## License

**All Rights Reserved**

This project is not open-source. The source code is published for portfolio and demonstration purposes only. You are welcome to review the code, but you may not copy, modify, distribute, or use it (or any part of it) for your own projects without explicit permission.