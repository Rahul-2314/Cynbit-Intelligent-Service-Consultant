import { Router } from "express";
import { z } from "zod";
import { Resend } from "resend";
import { streamChat, type ChatMessage } from "../services/consultant.js";
import { makeBrief } from "../services/brief.js";
import { env } from "../config/env.js";
import {
	dbEnabled,
	databaseReady,
	createOtp,
	verifyOtp,
	findSession,
	saveExchange,
	getConversationId,
	getOrCreateConversation,
	saveReport,
	getSavedReport,
	markReportSent,
	claimReportSend,
	releaseReportSend,
	normalizeEmail,
} from "../services/database.js";

export const api = Router();

const profileSchema = z.object({
	name: z.string().trim().min(2).max(100),
	email: z.string().email().max(200),
	company: z.string().trim().max(150).default(""),
	consent: z.boolean().default(true),
});

api.get("/health", (_req, res) =>
	res.json({
		ok: true,
		llmConfigured: Boolean(env.groqApiKey),
		emailConfigured: Boolean(env.resendApiKey),
		databaseConfigured: dbEnabled,
		databaseReady,
	}),
);

api.post("/auth/otp/send", async (req, res, next) => {
	try {
		if (!dbEnabled)
			return res
				.status(503)
				.json({ error: "PostgreSQL is not configured. Set DATABASE_URL." });
		profileSchema.parse(req.body);
		const { email } = profileSchema.parse(req.body);
		if (!env.resendApiKey)
			return res
				.status(503)
				.json({
					error:
						"Email delivery is not configured. Set RESEND_API_KEY and FROM_EMAIL.",
				});
		const otp = await createOtp(normalizeEmail(email));
		const resend = new Resend(env.resendApiKey);
		const result = await resend.emails.send({
			from: env.fromEmail,
			to: normalizeEmail(email),
			subject: `${otp} is your Cynbit verification code`,
			html: `<p>Use this code to verify your identity:</p><h1>${otp}</h1><p>It expires in ${env.otpTtlMinutes} minutes. If you did not request it, ignore this email.</p>`,
		});
		if (result.error) throw new Error(result.error.message);
		res.json({ ok: true, message: "Verification code sent." });
	} catch (error) {
		next(error);
	}
});

api.post("/auth/otp/verify", async (req, res, next) => {
	try {
		if (!dbEnabled)
			return res
				.status(503)
				.json({ error: "PostgreSQL is not configured. Set DATABASE_URL." });
		const input = profileSchema
			.extend({
				otp: z
					.string()
					.trim()
					.regex(/^\d{6}$/),
			})
			.parse(req.body);
		const result = await verifyOtp(
			input.email,
			input.otp,
			input.name,
			input.company,
			input.consent,
		);
		if ("error" in result) return res.status(400).json({ error: result.error });
		res.json(result);
	} catch (error) {
		next(error);
	}
});

api.post("/chat/stream", async (req, res, next) => {
	const input = z
		.object({
			message: z.string().trim().min(1).max(4000),
			history: z
				.array(
					z.object({
						role: z.enum(["user", "assistant"]),
						content: z.string().max(4000),
					}),
				)
				.max(300)
				.default([]),
			sessionToken: z.string().min(20),
		})
		.parse(req.body);
	try {
		const contact = await findSession(input.sessionToken);
		if (!contact)
			return res
				.status(401)
				.json({ error: "Verify your email before starting the conversation." });
		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Cache-Control", "no-cache, no-transform");
		res.setHeader("Connection", "keep-alive");
		res.flushHeaders();
		let assistantText = "";
		const history = input.history as ChatMessage[];
		const result = await streamChat(
			input.message,
			history,
			(token) => {
				assistantText += token;
				res.write(`data: ${JSON.stringify({ token })}\n\n`);
			},
			contact,
		);
		if (dbEnabled) {
			await saveExchange(contact, input.message, assistantText);
		}
		if (dbEnabled) {
			res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
			res.end();
		} else {
			res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
			res.end();
		}
	} catch (error) {
		if (res.headersSent) {
			res.write(
				`event: error\ndata: ${JSON.stringify({ message: "Chat could not be completed." })}\n\n`,
			);
			res.end();
		} else next(error);
	}
});

api.post("/brief/finalize", async (req, res, next) => {
	try {
		const input = z
			.object({
				sessionToken: z.string().min(20),
				messages: z
					.array(
						z.object({
							role: z.enum(["user", "assistant"]),
							content: z.string(),
						}),
					)
					.min(1)
					.max(300),
			})
			.parse(req.body);
		const contact = await findSession(input.sessionToken);
		if (!contact)
			return res
				.status(401)
				.json({ error: "Verify your email before finalizing the brief." });
		if (!dbEnabled)
			return res.json({
				ok: false,
				error:
					"PostgreSQL is not configured, so the report could not be saved.",
			});
		const conversationId = await getConversationId(contact.id);
		if (!conversationId)
			return res
				.status(400)
				.json({ error: "Start the conversation before finalizing the brief." });
		const saved = await getSavedReport(conversationId);
		if (!saved)
			return res
				.status(400)
				.json({
					error: "Review and generate the project brief before sending it.",
				});
		if (saved.email_sent_at)
			return res.json({ ok: true, alreadySent: true, brief: saved.brief_json });
		const claimed = await claimReportSend(conversationId);
		if (!claimed)
			return res.json({ ok: true, alreadySent: true, brief: saved.brief_json });
		const sent = await sendAutomaticReport(
			contact,
			saved.brief_json,
			input.messages as ChatMessage[],
		);
		if (!sent) {
			await releaseReportSend(conversationId);
			return res
				.status(502)
				.json({
					error:
						"The final report could not be emailed. Your brief remains saved.",
				});
		}
		await markReportSent(conversationId);
		res.json({ ok: true, alreadySent: false, brief: saved.brief_json });
	} catch (error) {
		next(error);
	}
});

api.post("/brief", async (req, res, next) => {
	try {
		const input = z
			.object({
				sessionToken: z.string().min(20),
				messages: z
					.array(
						z.object({
							role: z.enum(["user", "assistant"]),
							content: z.string(),
						}),
					)
					.min(1)
					.max(300),
			})
			.parse(req.body);
		const contact = await findSession(input.sessionToken);
		if (!contact)
			return res
				.status(401)
				.json({ error: "Verify your email before generating a brief." });
		const briefResult = await makeBrief(
			input.messages as ChatMessage[],
			contact,
		);
		if (dbEnabled) {
			const conversationId = await getOrCreateConversation(contact.id);
			if (conversationId)
				await saveReport(
					contact,
					conversationId,
					briefResult.brief,
					briefResult.sources,
				);
		}
		res.json(briefResult);
	} catch (error) {
		next(error);
	}
});

async function sendAutomaticReport(
	contact: any,
	brief: any,
	messages: ChatMessage[],
) {
	if (!env.resendApiKey || !env.teamEmail) return false;
	const resend = new Resend(env.resendApiKey);
	const list = (value: any) =>
		Array.isArray(value) && value.length
			? value.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")
			: "<li>To be confirmed</li>";
	const profile = brief.customerProfile || {};
	const nfr = brief.nonFunctionalRequirements || {};
	const phases = Array.isArray(brief.proposedPhases)
		? brief.proposedPhases
				.map(
					(phase: any) =>
						`<tr><td style="padding:10px;border-bottom:1px solid #e6ece8;width:135px"><strong>${escapeHtml(String(phase.name || "Phase"))}</strong></td><td style="padding:10px;border-bottom:1px solid #e6ece8">${escapeHtml(String(phase.outcome || "To be confirmed"))}${Array.isArray(phase.deliverables) && phase.deliverables.length ? `<br><span style="color:#65736c">${phase.deliverables.map((item: any) => escapeHtml(String(item))).join(" · ")}</span>` : ""}</td></tr>`,
				)
				.join("")
		: "";
	const conversation = messages
		.slice(-20)
		.map(
			(m) =>
				`<p style="margin:0 0 12px"><strong style="color:${m.role === "user" ? "#27664b" : "#66736c"}">${m.role === "user" ? "Customer" : "Cynbit"}</strong><br>${escapeHtml(m.content).replace(/\n/g, "<br>")}</p>`,
		)
		.join("");
	const html = `<!doctype html><html><body style="margin:0;background:#eef2ef;font-family:Arial,sans-serif;color:#26342d"><div style="max-width:760px;margin:0 auto;background:#fff">
  <div style="background:#183f30;padding:28px 36px;color:#fff"><div style="font-size:12px;letter-spacing:.18em;font-weight:bold;opacity:.85">CYNBIT · PROJECT DISCOVERY</div><h1 style="font-size:28px;margin:12px 0 4px">${escapeHtml(String(brief.projectTitle || "Preliminary project brief"))}</h1><p style="margin:0;color:#dceae2">Submitted for product team review</p></div>
  <div style="padding:28px 36px"><p style="margin:0 0 5px;color:#718078;font-size:12px;text-transform:uppercase">Customer</p><p style="margin:0;font-size:16px"><strong>${escapeHtml(contact.name)}</strong>${contact.company ? ` · ${escapeHtml(contact.company)}` : ""}</p><p style="margin:6px 0 24px;color:#65736c">${escapeHtml(contact.email)}</p>
  <div style="border-left:3px solid #5d896f;background:#f3f7f4;padding:16px;margin-bottom:24px"><h2 style="font-size:15px;margin:0 0 6px">Executive summary</h2><p style="margin:0;line-height:1.55">${escapeHtml(String(brief.executiveSummary || "To be confirmed"))}</p></div>
  <h2 style="font-size:16px;margin:24px 0 10px">Business case</h2><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 8px 8px 0;width:110px;color:#718078">Problem</td><td style="padding:8px;border-bottom:1px solid #e6ece8">${escapeHtml(String(brief.businessProblem || "To be confirmed"))}</td></tr><tr><td style="padding:8px 8px 8px 0;color:#718078">Current state</td><td style="padding:8px;border-bottom:1px solid #e6ece8">${escapeHtml(String(brief.currentState || "To be confirmed"))}</td></tr></table>
  <h2 style="font-size:16px;margin:24px 0 10px">Objectives and requirements</h2><div style="display:inline-block;vertical-align:top;width:48%"><p style="font-weight:bold;margin:0 0 5px">Objectives</p><ul style="padding-left:18px;margin:0">${list(brief.objectives)}</ul></div><div style="display:inline-block;vertical-align:top;width:48%"><p style="font-weight:bold;margin:0 0 5px">Functional requirements</p><ul style="padding-left:18px;margin:0">${list(brief.functionalRequirements)}</ul></div>
  <h2 style="font-size:16px;margin:24px 0 10px">Recommended direction</h2><p style="line-height:1.55">${escapeHtml(String(brief.recommendedDirection || "To be confirmed after discovery"))}</p><p style="font-weight:bold;margin:12px 0 5px">Relevant Cynbit capabilities</p><ul style="padding-left:18px;margin-top:0">${list(brief.relevantCynbitOfferings)}</ul>
  <h2 style="font-size:16px;margin:24px 0 10px">Proposed phases</h2><table style="width:100%;border-collapse:collapse;border-top:1px solid #e6ece8">${phases}</table>
  <h2 style="font-size:16px;margin:24px 0 10px">Constraints and success measures</h2><p style="font-weight:bold;margin:0 0 5px">Constraints</p><ul style="padding-left:18px;margin-top:0">${list(brief.constraints)}</ul><p style="font-weight:bold;margin:12px 0 5px">Success measures</p><ul style="padding-left:18px;margin-top:0">${list(brief.successMeasures)}</ul>
  <h2 style="font-size:16px;margin:24px 0 10px">Commercial context</h2><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 8px 8px 0;width:110px;color:#718078">Budget</td><td style="padding:8px;border-bottom:1px solid #e6ece8">${escapeHtml(String(brief.budget || "To be confirmed"))}</td></tr><tr><td style="padding:8px 8px 8px 0;color:#718078">Timeline</td><td style="padding:8px;border-bottom:1px solid #e6ece8">${escapeHtml(String(brief.timeline || "To be confirmed"))}</td></tr><tr><td style="padding:8px 8px 8px 0;color:#718078">Priority</td><td style="padding:8px;border-bottom:1px solid #e6ece8">${escapeHtml(String(brief.priority || "To be confirmed"))}</td></tr></table>
  <h2 style="font-size:16px;margin:24px 0 10px">Open questions</h2><ul style="padding-left:18px;line-height:1.5">${list(brief.openQuestions)}</ul>
  <h2 style="font-size:16px;margin:24px 0 10px">Verified conversation</h2><div style="background:#f7f9f7;border:1px solid #e6ece8;border-radius:8px;padding:16px">${conversation || "No conversation saved."}</div>
  <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e6ece8;color:#718078;font-size:11px">Preliminary AI-assisted discovery draft. Not a quote, contract, delivery commitment, architecture approval, or confirmation from Cynbit.</p></div></div></body></html>`;
	const result = await resend.emails.send({
		from: env.fromEmail,
		to: env.teamEmail,
		replyTo: contact.email,
		subject: `Project brief — ${brief.projectTitle || contact.company || contact.name}`,
		html,
	});
	return !result.error;
}

function escapeHtml(value: string) {
	return value.replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			] as string,
	);
}
