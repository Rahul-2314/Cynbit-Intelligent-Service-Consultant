# Technical Report — Cynbit Project Navigator

## 1. Problem
New visitors may find a technical services catalogue difficult to navigate if they do not know which service maps to their business problem. A basic contact form also leaves customers to decide how to describe requirements and gives the team limited structure for initial triage.

## 2. Proposed solution
A guided service-discovery and customer-onboarding experience. It recommends a service, verifies contact email when Resend is configured, collects project context, generates a preliminary project brief, and submits a structured inquiry with a reference ID.

## 3. Stack
React, TypeScript, Vite, Express, Zod, LangGraph.js, LangChain Groq integration, Resend. The current starter uses in-memory storage; replace with PostgreSQL/Prisma before production.

## 4. AI/agent design
The LangGraph workflow is intentionally bounded to drafting a preliminary brief. The model has no email-sending tools and cannot set prices or commit to delivery dates. Deterministic fallback generation is available when Groq is not configured or the model response is invalid.

## 5. Security and reliability
- OTP expires after 10 minutes and allows a limited number of attempts.
- OTP values are hashed server-side.
- Email sending requires server-side Resend credentials.
- Customer submission checks the server's verified-email state.
- API inputs are validated with Zod.
- Demo OTP mode must not be represented as actual email verification.
- Current in-memory OTP and inquiry stores are not production persistent; use a database, durable rate limits, admin authentication, monitoring, and retention policy before production.

## 6. Test plan
1. Select each service category and check the recommendation.
2. Submit invalid email/name and verify validation.
3. Send and verify a valid OTP in demo mode.
4. Try an incorrect OTP and more than five attempts.
5. Generate a brief with empty and detailed requirements.
6. Edit the brief and export it.
7. Submit without verification (must fail).
8. Submit after verification and check reference generation.
9. With Resend configured, confirm both team notification and customer confirmation.
10. Test mobile layout and API failure states.

## 7. Results
Fill in only after actually running tests. Record the test, observed result, and any known limitation. Do not claim successful live email delivery or an SLA unless verified.

## 8. Limitations and next steps
Configure production Resend domain; confirm Cynbit's response-time policy; add PostgreSQL/Prisma persistence, rate limiting by IP and email, consent and privacy notice, secure admin dashboard, PDF export, and deployment environment variables.
