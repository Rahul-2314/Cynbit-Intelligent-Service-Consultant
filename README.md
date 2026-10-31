# Cynbit Intelligent Service Consultant

A full-stack, conversational service-discovery prototype for the Cynbit website assessment. The repository contains the frontend, API backend, central company knowledge document, and report materials in one project directory.

> **Assessment prototype, not an official Cynbit product.** Public facts are based on the company website. Recommendations and generated briefs are drafts that require human confirmation. This prototype does not connect to Cynbit production systems.

## What it does

- Conversational service matching rather than a rigid multi-step form.
- Retrieval-augmented answers grounded in `knowledge/cynbit-knowledge.md`, a central Markdown knowledge source covering company overview, service lines, products, technologies, case-study listings, learning initiative, contact details, and safe recommendation rules.
- Groq-hosted LLM generation when `GROQ_API_KEY` is configured; graceful deterministic service-specific responses when it is not.
- Preliminary project-brief generation based on the conversation and retrieved knowledge.
- An inquiry handoff form that requires explicit consent and can send the conversation and draft brief using Resend.
- Source-section labels shown in the UI so the user can see which knowledge sections were retrieved.
- Request validation, bounded input sizes, HTML escaping for email content, and environment-based secrets.

## Stack

- Frontend: React, TypeScript, Vite, Lucide icons, responsive CSS.
- Backend: Node.js, TypeScript, Express, Zod.
- LLM: Groq API (OpenAI-compatible chat completions endpoint), optional.
- RAG: small local Markdown section retriever with token-overlap ranking. This is a transparent, dependency-light baseline; it is **not embedding-based semantic vector search**. The `retrieve()` interface is intentionally isolated so embeddings/vector storage can be introduced later without changing the chat UI.
- Email: Resend, optional.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
# from this project root
cp .env.example server/.env
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- API health: `http://localhost:4000/api/health`

On Windows PowerShell, copy environment template with `Copy-Item .env.example server/.env`.

### Configure Groq (recommended)

Put the key in `server/.env`:

```env
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
```

Without a key, the app still runs with rule-based answers and a deterministic preliminary brief. Do not commit `.env` or secrets.

### Configure email handoff (optional)

Set a valid Resend API key and a sender address verified for your Resend account in `server/.env`:

```env
RESEND_API_KEY=your_resend_api_key
TEAM_EMAIL=opportunities@cynbit.in
FROM_EMAIL=Your Verified Sender <verified-address@example.com>
```

The example sender in `.env.example` is only a placeholder and may not work for real delivery. Configure a sender/domain that your Resend account permits. The API sends an inquiry only after the user checks the consent box and submits the form. If email is not configured, the UI explains that delivery is unavailable and links to Cynbit's official contact page.

## API

### `GET /api/health`
Returns service name and whether Groq and Resend are configured.

### `POST /api/chat`
```json
{
  "message": "We need to automate document processing",
  "history": [{ "role": "user", "content": "We run an operations team" }]
}
```
Returns `{ response, sources, mode }`.

### `POST /api/brief`
```json
{ "messages": [{ "role": "user", "content": "We need an AI document workflow" }] }
```
Returns a structured draft brief and retrieved source-section names.

### `POST /api/inquiries`
Accepts `name`, `email`, optional `company`, `message`, optional `brief`, and `consent: true`. Requires Resend configuration. A successful response means Resend accepted the send request; it is not a guarantee of delivery or a response SLA from Cynbit.

## Project structure

```text
cynbit-intelligent-service-consultant/
├── client/                 # React frontend
│   └── src/App.tsx          # Chat, service shortcuts, brief modal, consented handoff
├── server/                 # Express API
│   └── src/
│       ├── config/          # Environment configuration
│       ├── rag/             # Knowledge loading and retrieval
│       ├── services/        # Groq, consultant, brief generation
│       └── routes/          # API endpoints
├── knowledge/
│   └── cynbit-knowledge.md  # Single editable source of public Cynbit information
├── docs/                    # Technical report template
├── .env.example
└── README.md
```

## RAG data refresh

Edit `knowledge/cynbit-knowledge.md` when verified public information changes. The server loads it by section and caches it for the life of the process; restart the API after editing. Content is based on these public pages:

- https://www.cynbit.in/
- https://www.cynbit.in/services
- https://www.cynbit.in/products
- https://www.cynbit.in/case-studies
- https://www.cynbit.in/contact
- https://www.cynbit.in/bitelevate
- https://www.cynbit.in/story
- https://www.cynbit.in/team
- https://www.cynbit.in/careers

## Known limitations / next steps

1. Retrieval uses lexical overlap rather than embeddings; add chunk embeddings and a vector index if semantic retrieval is needed.
2. Conversation state is held in the browser; there is no user account, database, analytics, or durable inquiry store.
3. The brief is AI-assisted and must be reviewed by a person. No prices, timelines, or delivery promises are generated by design.
4. Email delivery depends on a properly configured Resend sender/domain. Test with a controlled recipient before using a real team inbox.
5. Add automated unit/integration tests, rate limiting, abuse monitoring, privacy/retention controls, and deployment-specific CORS settings before production use.
6. The website knowledge is a snapshot and should be verified against the current official website before a real business decision.

## Assessment delivery checklist

- [ ] Install dependencies and run `npm run dev`.
- [ ] Set Groq key and verify both LLM and fallback paths.
- [ ] Test a product-specific question (Revio, TenantEase, Cynbit Studio) and a service question.
- [ ] Generate a project brief and review the unknowns/disclaimer.
- [ ] Test the consent gate and email delivery with a controlled inbox.
- [ ] Run `npm run build`.
- [ ] Push to GitHub and deploy frontend/API with the environment variables configured.
- [ ] Add live deployment URL and GitHub URL to the final submission portal.

## Single-service deployment

The `build` script builds the API and frontend. When the server starts from the `server` workspace and `client/dist` exists, Express serves the built frontend as well as `/api`, so the client and API can be deployed together as one Node service. Configure `PORT`, `GROQ_API_KEY`, and optional Resend values in the hosting provider. Set `CLIENT_ORIGIN` to the public origin if you later host the client separately. Verify the host's build/start commands against its workspace support.
