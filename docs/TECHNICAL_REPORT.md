# Technical Report — Cynbit Intelligent Service Consultant

## 1. Problem identified
Cynbit's public website presents multiple service lines, proprietary products, learning initiatives, and portfolio examples. A visitor who knows their business problem but not the correct technical category may need to navigate several pages or submit a generic enquiry before understanding the likely fit. The prototype adds a conversational discovery layer that connects a visitor's problem to relevant published Cynbit offerings.

## 2. Proposed solution
Cynbit Intelligent Service Consultant is a conversational assistant with a central company knowledge document. It retrieves relevant sections, generates a grounded answer, asks contextual follow-up questions, and can create a preliminary project brief. A separate inquiry form lets the user explicitly consent before sending their details and conversation to a configured team inbox.

## 3. Technology stack
- React + TypeScript + Vite for the client.
- Node.js + Express + TypeScript + Zod for the API.
- Groq chat completions API for optional language generation.
- Markdown-based local retrieval with token-overlap ranking.
- Resend for optional email handoff.

## 4. Architecture and data flow
1. User sends a message from the React chat.
2. The Express API validates the request.
3. The RAG module loads the central Markdown knowledge base and ranks sections against the current message and recent conversation.
4. When configured, Groq receives the retrieved excerpts plus conversation context and a grounded instruction set. If Groq is unavailable or unconfigured, a deterministic fallback responds to common service/product themes.
5. The client displays the response and the names of retrieved knowledge sections.
6. The brief endpoint applies the same retrieval process and returns a structured preliminary brief.
7. Inquiry submission requires the consent flag and sends only when Resend is configured.

## 5. Knowledge coverage
The central knowledge file covers company/contact information, AI automation, custom software, cloud/DevOps, digital marketing, Cynbit Studio, Revio, TenantEase, BitElevate, website-listed case studies, published technology capabilities, company story, team, careers, and recommendation guardrails. Marketing metrics are labelled as website claims rather than independent verification.

## 6. Safety and reliability decisions
- The LLM is instructed not to invent pricing, timelines, guarantees, SLAs, or case-study details.
- Project briefs are labelled preliminary and require human confirmation.
- Inquiry submission is a separate deterministic API action and requires explicit consent; the LLM cannot send email by itself.
- Inputs are validated with Zod, email HTML values are escaped, and secrets are read from environment variables.
- A fallback response path allows basic demonstration without an LLM key.

## 7. Current limitations
The retrieval baseline is lexical rather than embedding-based semantic search. There is no database, persistent conversation store, rate limiting, authentication, or durable inquiry record. The project needs dependency installation, build/runtime verification, endpoint tests, and deployment validation in the target environment before being represented as production-ready. Resend requires a verified sender configuration.

## 8. How to test
1. Run `npm install`, configure `server/.env`, and start with `npm run dev`.
2. Open `http://localhost:5173` and ask about AI automation, Revio, TenantEase, Cynbit Studio, cloud infrastructure, or digital marketing.
3. Verify the sources panel updates with relevant knowledge section names.
4. Generate a brief and confirm that unknown details remain unconfirmed rather than fabricated.
5. Open inquiry handoff and verify that submission is blocked until consent is checked.
6. With a controlled Resend configuration, submit a test inquiry and verify the email; without it, confirm that a configuration error is shown.
7. Run `npm run build` before deployment.

## 9. Public reference pages
- https://www.cynbit.in/
- https://www.cynbit.in/services
- https://www.cynbit.in/products
- https://www.cynbit.in/case-studies
- https://www.cynbit.in/contact
- https://www.cynbit.in/bitelevate
- https://www.cynbit.in/story
- https://www.cynbit.in/team
- https://www.cynbit.in/careers
