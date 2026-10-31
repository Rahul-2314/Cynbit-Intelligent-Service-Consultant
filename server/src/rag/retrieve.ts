import { readFile } from "node:fs/promises";
import path from "node:path";

export type KnowledgeChunk = {
	title: string;
	text: string;
	terms: Set<string>;
};

const STOP = new Set([
	"the",
	"and",
	"for",
	"with",
	"that",
	"this",
	"from",
	"into",
	"are",
	"you",
	"your",
	"can",
	"our",
	"how",
	"what",
	"when",
	"where",
	"why",
	"want",
	"need",
	"have",
	"has",
	"will",
	"would",
	"could",
	"about",
	"their",
	"them",
	"they",
	"its",
	"not",
	"but",
	"use",
	"using",
	"a",
	"an",
	"of",
	"to",
	"in",
	"on",
	"is",
	"it",
	"as",
	"by",
	"or",
	"be",
	"we",
	"i",
	"me",
	"my",
]);

const tokens = (s: string) =>
	s
		.toLowerCase()
		.match(/[a-z0-9+#.-]{2,}/g)
		?.filter((t) => !STOP.has(t)) ?? [];
let cache: KnowledgeChunk[] | null = null;

async function loadKnowledge(): Promise<KnowledgeChunk[]> {
	if (cache) return cache;
	const candidates = [
		path.resolve(process.cwd(), "../knowledge/cynbit-knowledge.md"),
		path.resolve(process.cwd(), "knowledge/cynbit-knowledge.md"),
		path.resolve(process.cwd(), "../../knowledge/cynbit-knowledge.md"),
	];

	let raw = "";
	for (const file of candidates) {
		try {
			raw = await readFile(file, "utf8");
			break;
		} catch {}
	}
	if (!raw) throw new Error("Could not load knowledge/cynbit-knowledge.md");

	const sections = raw.split(/(?=^## )/m).filter((s) => s.trim());

	cache = sections.map((section) => {
		const title =
			section.match(/^#{1,2}\s+(.+)/m)?.[1]?.trim() || "Cynbit knowledge";
		const words = new Set(tokens(section));
		return { title, text: section.trim(), terms: words };
	});

	return cache;
}

export async function retrieve(query: string, limit = 4) {
	const chunks = await loadKnowledge();
	const q = tokens(query);

	const scored = chunks
		.map((chunk) => {
			let score = 0;
			for (const token of q)
				if (chunk.terms.has(token)) score += token.length > 6 ? 2 : 1;
			// Give direct product/service names extra relevance without relying on an LLM.
			if (
				chunk.title
					.toLowerCase()
					.split(/\W+/)
					.some((w) => q.includes(w))
			)
				score += 3;
			return { title: chunk.title, text: chunk.text, score };
		})
		.filter((c) => c.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);

	return { chunks: scored, sourceCount: scored.length, knowledgeLoaded: true };
}
