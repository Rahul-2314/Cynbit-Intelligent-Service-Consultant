import { env } from "../config/env.js";

async function groqRequest(
	system: string,
	user: string,
	temperature: number,
	stream: boolean,
) {
	if (!env.groqApiKey) return null;
	return fetch("https://api.groq.com/openai/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: "Bearer " + env.groqApiKey,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: env.groqModel,
			temperature,
			max_tokens: 800,
			stream,
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: user },
			],
		}),
		signal: AbortSignal.timeout(25000),
	});
}

export async function askGroq(
	system: string,
	user: string,
	temperature = 0.3,
): Promise<string | null> {
	try {
		const response = await groqRequest(system, user, temperature, false);
		if (!response?.ok) return null;
		const data = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		return data.choices?.[0]?.message?.content?.trim() || null;
	} catch (error) {
		console.error(
			"Groq unavailable:",
			error instanceof Error ? error.message : error,
		);
		return null;
	}
}

export async function streamGroq(
	system: string,
	user: string,
	onToken: (token: string) => void,
	temperature = 0.3,
): Promise<boolean> {
	try {
		const response = await groqRequest(system, user, temperature, true);
		if (!response?.ok || !response.body) return false;
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) {
				if (!line.startsWith("data: ")) continue;
				const payload = line.slice(6).trim();
				if (!payload || payload === "[DONE]") continue;
				try {
					const data = JSON.parse(payload) as {
						choices?: Array<{ delta?: { content?: string } }>;
					};
					const token = data.choices?.[0]?.delta?.content;
					if (token) onToken(token);
				} catch {}
			}
		}
		return true;
	} catch (error) {
		console.error(
			"Groq streaming unavailable:",
			error instanceof Error ? error.message : error,
		);
		return false;
	}
}
