import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;
export const dbEnabled = Boolean(env.databaseUrl);
const usesSsl = /(?:sslmode=require|ssl=true)/i.test(env.databaseUrl);
let poolConnectionString = env.databaseUrl;
if (usesSsl) {
	try {
		const url = new URL(env.databaseUrl);
		url.searchParams.delete("sslmode");
		poolConnectionString = url.toString();
	} catch {}
}
export const pool = dbEnabled
	? new Pool({
			connectionString: poolConnectionString,
			ssl: usesSsl ? { rejectUnauthorized: false } : undefined,
			connectionTimeoutMillis: 10000,
		})
	: null;
export let databaseReady = false;

export function hashValue(value: string) {
	return createHash("sha256")
		.update(value)
		.update(env.databaseUrl)
		.digest("hex");
}

export function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}
export function normalizeCompany(company: string) {
	return company.trim().toLowerCase();
}

export async function initDatabase() {
	if (!pool) return false;
	await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE IF NOT EXISTS companies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL, company_id uuid REFERENCES companies(id), verified_at timestamptz, consent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (email, company_id));
    CREATE TABLE IF NOT EXISTS otp_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL, code_hash text NOT NULL, expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid REFERENCES contacts(id), token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid REFERENCES contacts(id) UNIQUE, updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE, role text NOT NULL CHECK (role IN ('user','assistant')), content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS project_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid REFERENCES contacts(id), conversation_id uuid REFERENCES conversations(id) UNIQUE, brief_json jsonb NOT NULL DEFAULT '{}', sources text[] NOT NULL DEFAULT '{}', email_sent_at timestamptz, email_send_started_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE project_reports ADD COLUMN IF NOT EXISTS email_send_started_at timestamptz;
  `);
	databaseReady = true;
	return true;
}

export async function findSession(token: string) {
	if (!pool || !token) return null;
	const result = await pool.query(
		`SELECT c.id, c.name, c.email, co.name AS company FROM sessions s JOIN contacts c ON c.id=s.contact_id LEFT JOIN companies co ON co.id=c.company_id WHERE s.token_hash=$1 AND s.expires_at>now() AND c.verified_at IS NOT NULL LIMIT 1`,
		[hashValue(token)],
	);
	return result.rows[0] || null;
}

export async function saveExchange(
	contact: any,
	userMessage: string,
	assistantMessage: string,
) {
	if (!pool) return null;
	const conversation = await pool.query(
		`INSERT INTO conversations (contact_id) VALUES ($1) ON CONFLICT (contact_id) DO UPDATE SET updated_at=now() RETURNING id`,
		[contact.id],
	);
	const conversationId = conversation.rows[0].id;
	await pool.query(
		`INSERT INTO messages (conversation_id, role, content) VALUES ($1,'user',$2), ($1,'assistant',$3)`,
		[conversationId, userMessage, assistantMessage],
	);
	return conversationId;
}

export async function getConversationId(contactId: string) {
	if (!pool) return null;
	const result = await pool.query(
		`SELECT id FROM conversations WHERE contact_id=$1 LIMIT 1`,
		[contactId],
	);
	return result.rows[0]?.id || null;
}

export async function getOrCreateConversation(contactId: string) {
	if (!pool) return null;
	const result = await pool.query(
		`INSERT INTO conversations (contact_id,updated_at) VALUES ($1,now()) ON CONFLICT (contact_id) DO UPDATE SET updated_at=now() RETURNING id`,
		[contactId],
	);
	return result.rows[0]?.id || null;
}

export async function getHistory(contactId: string) {
	if (!pool) return [];
	const result = await pool.query(
		`SELECT m.role,m.content FROM conversations c JOIN messages m ON m.conversation_id=c.id WHERE c.contact_id=$1 ORDER BY m.created_at ASC LIMIT 30`,
		[contactId],
	);
	return result.rows;
}

export async function getSavedReport(conversationId: string) {
	if (!pool) return null;
	const result = await pool.query(
		`SELECT brief_json,sources,email_sent_at FROM project_reports WHERE conversation_id=$1 LIMIT 1`,
		[conversationId],
	);
	return result.rows[0] || null;
}

export async function saveReport(
	contact: any,
	conversationId: string,
	brief: unknown,
	sources: string[] = [],
) {
	if (!pool) return null;
	const result = await pool.query(
		`INSERT INTO project_reports (contact_id,conversation_id,brief_json,sources,updated_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (conversation_id) DO UPDATE SET brief_json=EXCLUDED.brief_json,sources=EXCLUDED.sources,updated_at=now() RETURNING id,email_sent_at`,
		[contact.id, conversationId, brief, sources],
	);
	return result.rows[0];
}

export async function claimReportSend(conversationId: string) {
	if (!pool) return false;
	const result = await pool.query(
		`UPDATE project_reports SET email_send_started_at=now() WHERE conversation_id=$1 AND email_sent_at IS NULL AND (email_send_started_at IS NULL OR email_send_started_at < now() - interval '10 minutes') RETURNING id`,
		[conversationId],
	);
	return (result.rowCount ?? 0) > 0;
}

export async function markReportSent(conversationId: string) {
	if (!pool) return;
	await pool.query(
		`UPDATE project_reports SET email_sent_at=now(),email_send_started_at=NULL WHERE conversation_id=$1`,
		[conversationId],
	);
}

export async function releaseReportSend(conversationId: string) {
	if (!pool) return;
	await pool.query(
		`UPDATE project_reports SET email_send_started_at=NULL WHERE conversation_id=$1 AND email_sent_at IS NULL`,
		[conversationId],
	);
}

export async function createOtp(email: string) {
	if (!pool) throw new Error("PostgreSQL is not configured");
	await pool.query(
		`UPDATE otp_codes SET used_at=now() WHERE email=$1 AND used_at IS NULL`,
		[normalizeEmail(email)],
	);
	const otp = String(randomBytes(3).readUIntBE(0, 3) % 1000000).padStart(
		6,
		"0",
	);
	await pool.query(
		`INSERT INTO otp_codes (email,code_hash,expires_at) VALUES ($1,$2,now()+make_interval(mins=>$3))`,
		[normalizeEmail(email), hashValue(otp), env.otpTtlMinutes],
	);
	return otp;
}

export async function verifyOtp(
	email: string,
	otp: string,
	name: string,
	company: string,
	consent: boolean,
) {
	if (!pool) throw new Error("PostgreSQL is not configured");
	const normalizedEmail = normalizeEmail(email);
	const normalizedCompany = normalizeCompany(company || "");
	const record = await pool.query(
		`SELECT * FROM otp_codes WHERE email=$1 AND used_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1`,
		[normalizedEmail],
	);
	if (!record.rows[0])
		return { error: "That code is missing or expired. Send a new code." };
	const row = record.rows[0];
	if (row.attempts >= 5)
		return { error: "Too many attempts. Send a new code." };
	if (row.code_hash !== hashValue(otp)) {
		await pool.query(`UPDATE otp_codes SET attempts=attempts+1 WHERE id=$1`, [
			row.id,
		]);
		return { error: "The code is incorrect." };
	}
	await pool.query(
		`UPDATE otp_codes SET used_at=now(),attempts=attempts+1 WHERE id=$1`,
		[row.id],
	);
	let companyId: string | null = null;
	if (normalizedCompany) {
		const companyResult = await pool.query(
			`INSERT INTO companies (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
			[normalizedCompany],
		);
		companyId = companyResult.rows[0].id;
	}
	const existing = await pool.query(
		`SELECT id,name,email FROM contacts WHERE email=$1 AND company_id IS NOT DISTINCT FROM $2 LIMIT 1`,
		[normalizedEmail, companyId],
	);
	let contact;
	if (existing.rows[0]) {
		const updated = await pool.query(
			`UPDATE contacts SET name=$1, verified_at=now(), consent_at=CASE WHEN $3 THEN now() ELSE consent_at END, updated_at=now() WHERE id=$2 RETURNING id,name,email`,
			[name.trim(), existing.rows[0].id, consent],
		);
		contact = updated.rows[0];
	} else {
		const created = await pool.query(
			`INSERT INTO contacts (name,email,company_id,verified_at,consent_at,updated_at) VALUES ($1,$2,$3,now(),${consent ? "now()" : "NULL"},now()) RETURNING id,name,email`,
			[name.trim(), normalizedEmail, companyId],
		);
		contact = created.rows[0];
	}
	const token = randomBytes(32).toString("hex");
	await pool.query(
		`INSERT INTO sessions (contact_id,token_hash,expires_at) VALUES ($1,$2,now()+interval '30 days')`,
		[contact.id, hashValue(token)],
	);
	const companyResult = await pool.query(
		`SELECT co.name FROM contacts c LEFT JOIN companies co ON co.id=c.company_id WHERE c.id=$1`,
		[contact.id],
	);
	return {
		contact: {
			id: contact.id,
			name: contact.name,
			email: contact.email,
			company: companyResult.rows[0]?.name || "",
		},
		token,
	};
}
