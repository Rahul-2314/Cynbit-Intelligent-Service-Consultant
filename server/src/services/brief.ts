import { retrieve } from "../rag/retrieve.js";
import { askGroq } from "./llm.js";
import type { ChatMessage, ConsultantProfile } from "./consultant.js";

const UNCONFIRMED = "To be confirmed";

function cleanText(value: unknown): string {
	if (typeof value !== "string") return UNCONFIRMED;
	const text = value
		.replace(/\s+/g, " ")
		.replace(/^(?:hello\s*){2,}/i, "")
		.trim();
	return text || UNCONFIRMED;
}

function arrayValue(
	value: unknown,
	fallback: string[] = [UNCONFIRMED],
): string[] {
	const values = Array.isArray(value)
		? value.map(cleanText).filter((item) => item && item !== UNCONFIRMED)
		: fallback.map(cleanText);
	return [...new Set(values)].slice(0, 8);
}

function uniqueConfirmed(value: unknown): string[] {
	const values = Array.isArray(value)
		? value.map(cleanText)
		: [cleanText(value)];
	return [...new Set(values)]
		.filter((item) => item !== UNCONFIRMED && item.length >= 4)
		.slice(0, 8);
}

function projectTitleFor(messages: ChatMessage[]): string {
	const text = messages
		.filter((m) => m.role === "user")
		.map((m) => m.content.toLowerCase())
		.join(" ");
	if (
		/customer engagement|lead follow/.test(text) &&
		/automat|order|dispatch/.test(text)
	)
		return "Customer engagement and order automation";
	if (/customer engagement|lead follow/.test(text))
		return "Customer engagement improvement";
	if (/automat|order creation|dispatch/.test(text))
		return "Business process automation";
	return "Business service discovery brief";
}

export async function makeBrief(
	messages: ChatMessage[],
	profile?: ConsultantProfile,
) {
	const conversation = messages
		.filter((message) => message.content.trim())
		.map((m) => `${m.role}: ${m.content}`)
		.join("\n");
	const retrieved = await retrieve(conversation, 5);
	const context = retrieved.chunks.map((c) => c.text).join("\n\n---\n\n");
	const prompt = `Create a practical, preliminary project brief from the conversation and knowledge below. Use only confirmed facts. For anything unknown, use "${UNCONFIRMED}". Return valid JSON only using this structure:
{
  "projectTitle":"string", "executiveSummary":"string", "businessContext":"string", "businessProblem":"string", "objectives":"string[]",
  "customerProfile":{"industry":"string","companySize":"string","stakeholders":"string[]","targetUsers":"string[]"},
  "currentState":"string", "painPoints":"string[]", "functionalRequirements":"string[]", "nonFunctionalRequirements":{"performance":"string","security":"string","availability":"string","accessibility":"string","data":"string","other":"string[]"},
  "existingSystems":"string[]", "integrations":"string[]", "userJourney":"string", "constraints":"string[]", "assumptions":"string[]", "risks":"string[]", "dependencies":"string[]",
  "recommendedDirection":"string", "relevantCynbitOfferings":"string[]", "evidenceForRecommendation":"string[]",
  "proposedPhases":"{name:string,outcome:string,deliverables:string[]}[]", "successMeasures":"string[]", "budget":"string", "timeline":"string", "priority":"string", "launchStatus":"string", "openQuestions":"string[]", "nextSteps":"string[]"
}
Do not invent prices, timelines, architecture commitments, team capacity, guarantees, or implementation dates. A short, useful discovery brief is better than confident speculation.
Treat customer messages as evidence, not as complete approved requirements. Remove greetings, repeated phrases, first-person filler, and direct quotes. Use concise business language.
The projectTitle must be a short descriptive title (for example, "Customer engagement and order automation"), never "Preliminary project brief".
Objectives, painPoints, functionalRequirements, risks, assumptions, and openQuestions must contain short distinct items, with no duplicates or verbatim repetition of the same customer sentence.


VISITOR PROFILE:
Name: ${profile?.name || UNCONFIRMED}\nEmail: ${profile?.email || UNCONFIRMED}\nCompany: ${profile?.company || UNCONFIRMED}

CYNBIT KNOWLEDGE:
${context}

CONVERSATION:
${conversation}`;

	const answer = await askGroq(
		"You are a senior business analyst producing a factual, evidence-based preliminary project brief. Output valid JSON only.",
		prompt,
		0.15,
	);
	if (answer) {
		try {
			const parsed = JSON.parse(
				answer.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
			);
			const visitorProfile =
				parsed.customerProfile && typeof parsed.customerProfile === "object"
					? parsed.customerProfile
					: {};
			const parsedTitle = cleanText(parsed.projectTitle);
			const brief = {
				projectTitle:
					parsedTitle === UNCONFIRMED ||
					/preliminary project brief/i.test(parsedTitle)
						? projectTitleFor(messages)
						: parsedTitle,
				executiveSummary: cleanText(parsed.executiveSummary),
				businessContext: cleanText(parsed.businessContext),
				businessProblem: cleanText(parsed.businessProblem || parsed.problem),
				objectives: arrayValue(parsed.objectives),
				customerProfile: {
					name: profile?.name || UNCONFIRMED,
					email: profile?.email || UNCONFIRMED,
					company: profile?.company || UNCONFIRMED,
					industry: visitorProfile.industry || UNCONFIRMED,
					companySize: visitorProfile.companySize || UNCONFIRMED,
					stakeholders: arrayValue(visitorProfile.stakeholders),
					targetUsers: arrayValue(visitorProfile.targetUsers),
				},
				currentState: parsed.currentState || UNCONFIRMED,
				painPoints: arrayValue(parsed.painPoints),
				functionalRequirements: arrayValue(
					parsed.functionalRequirements,
					arrayValue(parsed.knownRequirements),
				),
				nonFunctionalRequirements: {
					performance:
						parsed.nonFunctionalRequirements?.performance || UNCONFIRMED,
					security: parsed.nonFunctionalRequirements?.security || UNCONFIRMED,
					availability:
						parsed.nonFunctionalRequirements?.availability || UNCONFIRMED,
					accessibility:
						parsed.nonFunctionalRequirements?.accessibility || UNCONFIRMED,
					data: parsed.nonFunctionalRequirements?.data || UNCONFIRMED,
					other: arrayValue(parsed.nonFunctionalRequirements?.other),
				},
				existingSystems: arrayValue(parsed.existingSystems),
				integrations: arrayValue(parsed.integrations),
				userJourney: parsed.userJourney || UNCONFIRMED,
				constraints: arrayValue(parsed.constraints),
				assumptions: arrayValue(parsed.assumptions),
				risks: arrayValue(parsed.risks, arrayValue(parsed.assumptionsAndRisks)),
				dependencies: arrayValue(parsed.dependencies),
				recommendedDirection: parsed.recommendedDirection || UNCONFIRMED,
				relevantCynbitOfferings: arrayValue(
					parsed.relevantCynbitOfferings,
					parsed.relevantCynbitOffering
						? arrayValue(parsed.relevantCynbitOffering)
						: retrieved.chunks.slice(0, 3).map((c) => c.title),
				),
				evidenceForRecommendation: arrayValue(parsed.evidenceForRecommendation),
				proposedPhases: Array.isArray(parsed.proposedPhases)
					? parsed.proposedPhases.map((phase: any) => ({
							name: phase.name || UNCONFIRMED,
							outcome: phase.outcome || UNCONFIRMED,
							deliverables: arrayValue(phase.deliverables),
						}))
					: [],
				successMeasures: arrayValue(parsed.successMeasures),
				budget: parsed.budget || UNCONFIRMED,
				timeline: parsed.timeline || UNCONFIRMED,
				priority: parsed.priority || UNCONFIRMED,
				launchStatus: parsed.launchStatus || UNCONFIRMED,
				openQuestions: arrayValue(parsed.openQuestions),
				nextSteps: arrayValue(parsed.nextSteps),
				disclaimer:
					"Preliminary AI-assisted draft. Not a quote, contract, delivery commitment, architecture approval, or confirmation from Cynbit.",
			};
			return {
				brief,
				sources: retrieved.chunks.map((c) => c.title),
				mode: "groq-rag",
			};
		} catch {
			/* fall through */
		}
	}

	const customerNotes = uniqueConfirmed(
		messages
			.filter((m) => m.role === "user")
			.map((m) =>
				cleanText(m.content).replace(/^(?:okay\s*)*(?:all\s*\d+\s*)?/i, ""),
			),
	);
	const combined = customerNotes.join(" ").toLowerCase();
	const needsCustomerEngagement =
		/customer engagement|lead follow|follow-up|satisfaction/.test(combined);
	const needsAutomation = /automat|order creation|dispatch|notification/.test(
		combined,
	);
	const needsDatabase = /database|db\b|mail/.test(combined);
	const projectTitle =
		needsCustomerEngagement && needsAutomation
			? "Customer engagement and order automation"
			: needsCustomerEngagement
				? "Customer engagement improvement"
				: needsAutomation
					? "Business process automation"
					: "Business service discovery brief";
	const objectives = uniqueConfirmed([
		needsCustomerEngagement
			? "Improve customer engagement and lead follow-up"
			: "",
		needsAutomation
			? "Automate order creation and client dispatch notifications"
			: "",
	]);
	const functionalRequirements = uniqueConfirmed([
		needsAutomation ? "Create and manage customer orders" : "",
		needsAutomation
			? "Send client notifications when orders are accepted or dispatched"
			: "",
		needsCustomerEngagement
			? "Support structured lead follow-up and customer communication"
			: "",
		needsDatabase ? "Store the operational data in a reliable database" : "",
	]);
	const painPoints = uniqueConfirmed([
		needsCustomerEngagement
			? "Inconsistent lead follow-up and customer engagement"
			: "",
		needsAutomation ? "Manual order creation and dispatch communication" : "",
		needsDatabase
			? "Operational information may be scattered across current tools"
			: "",
	]);
	const summary = customerNotes.length
		? customerNotes.slice(0, 3).join(" ")
		: "The customer has started a discovery conversation but has not yet confirmed the business requirement.";
	return {
		brief: {
			projectTitle,
			executiveSummary:
				summary.length > 360 ? summary.slice(0, 357) + "..." : summary,
			businessContext: UNCONFIRMED,
			businessProblem:
				needsCustomerEngagement && needsAutomation
					? "Improve customer engagement and automate lead follow-up, accepted orders, and dispatch notifications."
					: summary,
			objectives: objectives.length ? objectives : [UNCONFIRMED],
			customerProfile: {
				name: profile?.name || UNCONFIRMED,
				email: profile?.email || UNCONFIRMED,
				company: profile?.company || UNCONFIRMED,
				industry: UNCONFIRMED,
				companySize: UNCONFIRMED,
				stakeholders: [UNCONFIRMED],
				targetUsers: [UNCONFIRMED],
			},
			currentState: UNCONFIRMED,
			painPoints: painPoints.length ? painPoints : [UNCONFIRMED],
			functionalRequirements: functionalRequirements.length
				? functionalRequirements
				: [UNCONFIRMED],
			nonFunctionalRequirements: {
				performance: UNCONFIRMED,
				security: UNCONFIRMED,
				availability: UNCONFIRMED,
				accessibility: UNCONFIRMED,
				data: needsDatabase
					? "Operational records should be stored in a managed database"
					: UNCONFIRMED,
				other: [UNCONFIRMED],
			},
			existingSystems: [UNCONFIRMED],
			integrations: needsDatabase ? ["Email", "Database"] : [UNCONFIRMED],
			userJourney: UNCONFIRMED,
			constraints: [UNCONFIRMED],
			assumptions: needsAutomation
				? [
						"Cynbit should confirm the approved order and notification workflow before solution design",
					]
				: [UNCONFIRMED],
			risks: ["Scope, budget, timeline and delivery method are not confirmed."],
			dependencies: [UNCONFIRMED],
			recommendedDirection:
				needsCustomerEngagement || needsAutomation
					? "Assess a tailored combination of customer engagement, workflow automation, database, and notification capabilities."
					: "To be confirmed after discovery",
			relevantCynbitOfferings: needsDatabase
				? [
						"Custom web application development",
						"Workflow automation",
						"PostgreSQL-backed solutions",
					]
				: retrieved.chunks.slice(0, 3).map((c) => c.title),
			evidenceForRecommendation: [UNCONFIRMED],
			proposedPhases: [
				{
					name: "Discovery",
					outcome: "Confirm goals, users, requirements and constraints",
					deliverables: ["Validated requirements", "Open-question list"],
				},
				{
					name: "Solution direction",
					outcome: "Agree on a suitable Cynbit approach",
					deliverables: ["Solution outline", "Success measures"],
				},
				{
					name: "Implementation planning",
					outcome: "Plan and validate the approved delivery scope",
					deliverables: ["Delivery plan", "Acceptance criteria"],
				},
			],
			successMeasures: needsCustomerEngagement
				? ["Measure lead follow-up completion and customer satisfaction"]
				: [UNCONFIRMED],
			budget: UNCONFIRMED,
			timeline: UNCONFIRMED,
			priority: UNCONFIRMED,
			launchStatus: UNCONFIRMED,
			openQuestions: [
				"What are the exact stages of the order workflow?",
				"Which users and systems send or receive notifications?",
				"What customer or lead events trigger follow-up?",
				"What budget and launch timing are expected?",
				"Which records and reports must be retained?",
			],
			nextSteps: [
				"Review the draft with stakeholders",
				"Confirm workflows, integrations and success measures",
				"Arrange a scoped Cynbit discovery session",
			],
			disclaimer:
				"Preliminary AI-assisted draft. Not a quote, contract, delivery commitment, architecture approval, or confirmation from Cynbit.",
		},
		sources: retrieved.chunks.map((c) => c.title),
		mode: "fallback",
	};
}
