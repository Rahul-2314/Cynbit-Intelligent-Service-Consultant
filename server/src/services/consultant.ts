import { retrieve } from "../rag/retrieve.js";
import { askGroq, streamGroq } from "./llm.js";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ConsultantProfile = {
	name?: string;
	email?: string | "";
	company?: string;
};
// const SYSTEM = `You are Cynbit Intelligent Service Consultant, a guided onboarding agent for potential customers. Use only the retrieved knowledge as factual grounding. The visitor's name and email have already been collected before project questions begin. Keep the conversation focused and help the product team prepare a stronger pitch. First understand the business goal and the problem. Then ask at most one or two focused follow-up questions covering users, current process/systems, must-have requirements, constraints, urgency, and desired success measure. Do not ask personal or irrelevant technical questions. Recommend a specific existing Cynbit product or custom service when there is enough evidence, explain the match briefly, and distinguish products from custom development. Never invent prices, timelines, guarantees, SLAs, implementation details, or client outcomes. End discovery with a concise preliminary direction and suggest generating the project brief. Never claim that an inquiry was submitted.`;
export const SYSTEM = `
You are Cynbit Intelligent Service Consultant, a conversational product discovery assistant.

Goal: Understand the visitor's business problem, recommend the most relevant Cynbit product or service, and help them prepare a project brief.

Rules:
1. The visitor's name and email are already collected. Never ask for them again.
2. Understand the visitor's goal naturally. Ask at most 1–2 relevant follow-up questions, only when needed. Avoid lengthy questionnaires.
3. Recommend early. Use retrieved knowledge to suggest a relevant existing Cynbit product or service as soon as you have enough information. Briefly explain the match, invite the visitor to explore it or share additional requirements, and suggest generating a project brief so Cynbit's team can review their needs. If no documented offering fits, offer a brief for the team to assess a custom solution.
4. Distinguish existing products from custom development. If no documented offering fits, explain that Cynbit may need to assess a custom solution. Ask only essential follow-up questions.
5. Once the problem is clear, summarise the preliminary direction and offer to generate a project brief for Cynbit's team.
6. Use retrieved knowledge as the factual source for Cynbit's offerings. Never invent features, prices, timelines, guarantees, SLAs, or client outcomes. If information is missing, say so.
7. Never claim an inquiry was submitted or the team was contacted unless the application confirms it. Never promise a response time.

Style: Friendly, professional, concise, and consultative. Ask one question at a time. Avoid repetition, unnecessary technical jargon, and aggressive sales language.

Priority: Understand → Recommend → Clarify if needed → Offer project brief.
`.trim();

export async function streamChat(
	message: string,
	history: ChatMessage[] = [],
	onToken: (token: string) => void,
	profile?: ConsultantProfile,
) {
	const retrieved = await retrieve(
		`${history
			.slice(-4)
			.map((m) => m.content)
			.join(" ")} ${message}`,
		4,
	);
	const context = retrieved.chunks.map((c) => c.text).join("\n\n---\n\n");
	const prompt = `VISITOR PROFILE:\nName: ${profile?.name || "Not provided"}\nEmail: ${profile?.email || "Not provided"}\nCompany: ${profile?.company || "Not provided"}\n\nRETRIEVED KNOWLEDGE:\n${context || "No directly relevant section was retrieved."}\n\nRECENT CONVERSATION:\n${history
		.slice(-6)
		.map((m) => `${m.role}: ${m.content}`)
		.join("\n")}\n\nUSER MESSAGE: ${message}`;
	const streamed = await streamGroq(SYSTEM, prompt, onToken);
	if (!streamed) {
		const answer = fallback(
			message,
			retrieved.chunks.map((c) => c.title),
		);
		onToken(answer);
	}
	return {
		sources: retrieved.chunks.map((c) => c.title),
		mode: streamed ? "groq-rag-stream" : "retrieval-fallback",
	};
}

export async function chat(
	message: string,
	history: ChatMessage[] = [],
	profile?: ConsultantProfile,
) {
	const retrieved = await retrieve(
		`${history
			.slice(-4)
			.map((m) => m.content)
			.join(" ")} ${message}`,
		4,
	);

	const context = retrieved.chunks.map((c) => c.text).join("\n\n---\n\n");
	const answer = await askGroq(
		SYSTEM,
		`VISITOR PROFILE:\nName: ${profile?.name || "Not provided"}\nEmail: ${profile?.email || "Not provided"}\nCompany: ${profile?.company || "Not provided"}\n\nRETRIEVED KNOWLEDGE:\n${context || "No directly relevant section was retrieved."}\n\nRECENT CONVERSATION:\n${history
			.slice(-6)
			.map((m) => `${m.role}: ${m.content}`)
			.join("\n")}\n\nUSER MESSAGE: ${message}`,
	);

	const response =
		answer ||
		fallback(
			message,
			retrieved.chunks.map((c) => c.title),
		);
	return {
		response,
		sources: retrieved.chunks.map((c) => c.title),
		mode: answer ? "groq-rag" : "retrieval-fallback",
	};
}

function fallback(message: string, titles: string[]) {
	const q = message.toLowerCase();
	if (/revio|reviews|reputation|sentiment|ratings/.test(q))
		return "Revio looks relevant if your main need is review management, AI-assisted responses, sentiment monitoring, or managing reputation across multiple locations. Are you trying to solve this for one location or several?";
	if (/tenantease|tenant|rent|property|landlord|occupancy/.test(q))
		return "TenantEase is Cynbit’s property and tenant management product. Its published features include tenant records, rent and payment tracking, reminders, unit availability, and occupancy/revenue views. Which part of your property workflow is most difficult today?";
	if (
		/studio|coding|student|learning|career|mock interview|resume|placement/.test(
			q,
		)
	)
		return "Cynbit Studio is positioned as an AI-powered learning and career-readiness platform, with adaptive learning, coding missions, AI code feedback, mock interviews, and career tools. Is your interest individual learning or an institution/team rollout?";
	if (/ai|agent|llm|automate|workflow|document/.test(q))
		return "Cynbit lists custom AI agents, LLM integrations, document automation, AI voice agents, and business workflows. To narrow the recommendation, what task or workflow do you want to improve, and what systems does it use today?";

	if (/cloud|aws|azure|devops|deploy|migration|infra|uptime/.test(q))
		return "Cynbit lists cloud architecture, AWS/Azure, DevOps, CI/CD, infrastructure automation, and legacy modernisation. What is the main challenge: deployment reliability, scaling, migration, security, or release speed?";

	if (/seo|marketing|ads|crm|lead|conversion|campaign/.test(q))
		return "Cynbit lists performance ads, technical SEO, CRM automation, and funnel optimisation. What outcome matters most—more qualified leads, better search visibility, stronger conversion, or improved follow-up?";

	if (
		/website|web app|mobile|saas|software|api|dashboard|platform|build/.test(q)
	)
		return "Cynbit offers custom web/mobile development, backend APIs, SaaS platforms, and product engineering. What are you planning to build, who will use it, and does an existing system need to be integrated?";

	return `I can help map your goal to Cynbit’s published services and products. ${titles.length ? `I found potentially relevant areas: ${titles.slice(0, 3).join(", ")}. ` : ""}What are you trying to achieve or what problem is slowing your team down?`;
}
