import { Fragment, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
	ArrowUpRight,
	Check,
	ChevronRight,
	LoaderCircle,
	Mail,
	RotateCcw,
	Send,
	ShieldCheck,
	Sparkles,
	X,
} from "lucide-react";
import "./styles.css";

type Message = { role: "user" | "assistant"; content: string };

function formatInline(text: string): ReactNode[] {
	return text
		.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s]+\))/g)
		.filter(Boolean)
		.map((part, i) => {
			if (part.startsWith("**"))
				return <strong key={i}>{part.slice(2, -2)}</strong>;
			if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
			const link = part.match(/^\[([^\]]+)\]\(([^\s]+)\)$/);
			if (link)
				return (
					<a key={i} href={link[2]} target="_blank" rel="noreferrer">
						{link[1]}
					</a>
				);
			return <Fragment key={i}>{part}</Fragment>;
		});
}

function MessageText({ content }: { content: string }) {
	const parts = content
		.replace(/\r/g, "")
		.split(/(```[\s\S]*?```)/g)
		.filter(Boolean);
	return (
		<>
			{parts.map((part, i) => {
				const fence = part.match(/^```(?:\w+)?\n?([\s\S]*?)```$/);
				if (fence)
					return (
						<pre className="message-code" key={i}>
							<code>{fence[1].trim()}</code>
						</pre>
					);

				const blocks: string[] = [];
				let paragraph: string[] = [];
				let list: { kind: "ul" | "ol"; items: string[] } | null = null;
				const flush = () => {
					if (paragraph.length) {
						blocks.push(`P:${paragraph.join("\n")}`);
						paragraph = [];
					}
					if (list) {
						blocks.push(
							`${list.kind === "ul" ? "U" : "O"}:${list.items.join("\n")}`,
						);
						list = null;
					}
				};

				for (const line of part.split("\n")) {
					const heading = line.match(/^#{1,3}\s+(.+)/);
					const unordered = line.match(/^\s*[-*]\s+(.+)/);
					const ordered = line.match(/^\s*\d+[.)]\s+(.+)/);
					if (heading) {
						flush();
						blocks.push(`H:${heading[1]}`);
					} else if (unordered) {
						if (paragraph.length) flush();
						if (!list || list.kind !== "ul") {
							flush();
							list = { kind: "ul", items: [] };
						}
						list.items.push(unordered[1]);
					} else if (ordered) {
						if (paragraph.length) flush();
						if (!list || list.kind !== "ol") {
							flush();
							list = { kind: "ol", items: [] };
						}
						list.items.push(ordered[1]);
					} else if (line.trim()) {
						paragraph.push(line.trim());
					} else {
						flush();
					}
				}
				flush();

				return (
					<Fragment key={i}>
						{blocks.map((block, j) => {
							const kind = block[0];
							const value = block.slice(2);
							if (kind === "H") return <h3 key={j}>{formatInline(value)}</h3>;
							if (kind === "U" || kind === "O") {
								const Tag = kind === "U" ? "ul" : "ol";
								return (
									<Tag key={j}>
										{value.split("\n").map((item, k) => (
											<li key={k}>{formatInline(item)}</li>
										))}
									</Tag>
								);
							}
							return (
								<p key={j}>
									{value.split("\n").map((line, k) => (
										<Fragment key={k}>
											{k > 0 && <br />}
											{formatInline(line)}
										</Fragment>
									))}
								</p>
							);
						})}
					</Fragment>
				);
			})}
		</>
	);
}

function valueList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map(String).filter(Boolean)
		: value
			? [String(value)]
			: ["Not yet captured"];
}

function DraftView({ brief }: { brief: Record<string, unknown> }) {
	const section = (title: string, value: unknown) => (
		<section className="draft-section">
			<h3>{title}</h3>
			{typeof value === "string" ? (
				<p>{value}</p>
			) : (
				<ul>
					{valueList(value).map((item, i) => (
						<li key={i}>{item}</li>
					))}
				</ul>
			)}
		</section>
	);
	const profile =
		typeof brief.customerProfile === "object" && brief.customerProfile
			? (brief.customerProfile as Record<string, unknown>)
			: {};
	const nonFunctional =
		typeof brief.nonFunctionalRequirements === "object" &&
		brief.nonFunctionalRequirements
			? (brief.nonFunctionalRequirements as Record<string, unknown>)
			: {};
	const phases = Array.isArray(brief.proposedPhases)
		? (brief.proposedPhases as Record<string, unknown>[])
		: [];
	return (
		<div className="draft-content">
			{section("Executive summary", brief.executiveSummary)}
			{section(
				"Business context and problem",
				String(brief.businessContext || "To be confirmed") +
					(brief.businessProblem
						? "\n\nProblem: " + String(brief.businessProblem)
						: ""),
			)}
			{section("Objectives", brief.objectives)}
			<section className="draft-section">
				<h3>Customer and stakeholders</h3>
				<dl>
					<div>
						<dt>Name</dt>
						<dd>{String(profile.name || "To be confirmed")}</dd>
					</div>
					<div>
						<dt>Company</dt>
						<dd>{String(profile.company || "To be confirmed")}</dd>
					</div>
					<div>
						<dt>Email</dt>
						<dd>{String(profile.email || "To be confirmed")}</dd>
					</div>
					<div>
						<dt>Industry</dt>
						<dd>{String(profile.industry || "To be confirmed")}</dd>
					</div>
					<div>
						<dt>Target users</dt>
						<dd>{valueList(profile.targetUsers).join(", ")}</dd>
					</div>
					<div>
						<dt>Stakeholders</dt>
						<dd>{valueList(profile.stakeholders).join(", ")}</dd>
					</div>
				</dl>
			</section>
			{section(
				"Current state and pain points",
				"Current state: " +
					String(brief.currentState || "To be confirmed") +
					"\n\nPain points:\n" +
					valueList(brief.painPoints).join("\n"),
			)}
			{section("Functional requirements", brief.functionalRequirements)}
			<section className="draft-section">
				<h3>Non-functional requirements</h3>
				<dl>
					<div>
						<dt>Performance</dt>
						<dd>{String(nonFunctional.performance || "To be confirmed")}</dd>
					</div>
					<div>
						<dt>Security</dt>
						<dd>{String(nonFunctional.security || "To be confirmed")}</dd>
					</div>
					<div>
						<dt>Availability</dt>
						<dd>{String(nonFunctional.availability || "To be confirmed")}</dd>
					</div>
					<div>
						<dt>Accessibility</dt>
						<dd>{String(nonFunctional.accessibility || "To be confirmed")}</dd>
					</div>
					<div>
						<dt>Data</dt>
						<dd>{String(nonFunctional.data || "To be confirmed")}</dd>
					</div>
				</dl>
			</section>
			{section(
				"Existing systems and integrations",
				valueList(brief.existingSystems).concat([
					"Integrations: " + valueList(brief.integrations).join(", "),
				]),
			)}
			{section(
				"Constraints, assumptions and risks",
				valueList(brief.constraints)
					.concat(valueList(brief.assumptions))
					.concat(valueList(brief.risks))
					.concat(valueList(brief.dependencies)),
			)}
			{section("Recommended Cynbit direction", brief.recommendedDirection)}
			{section("Relevant offerings", brief.relevantCynbitOfferings)}
			<section className="draft-section">
				<h3>Proposed phases</h3>
				{phases.length ? (
					<div className="phase-list">
						{phases.map((phase, i) => (
							<div key={i}>
								<b>{String(phase.name || "Phase")}</b>
								<p>{String(phase.outcome || "Outcome to be confirmed")}</p>
								{Array.isArray(phase.deliverables) && (
									<small>{phase.deliverables.join(" · ")}</small>
								)}
							</div>
						))}
					</div>
				) : (
					<p>To be confirmed</p>
				)}
			</section>
			{section("Success measures", brief.successMeasures)}
			<section className="draft-section">
				<h3>Commercial and timing context</h3>
				<dl>
					<div>
						<dt>Budget</dt>
						<dd>{String(brief.budget || "To be confirmed")}</dd>
					</div>
					<div>
						<dt>Timeline</dt>
						<dd>{String(brief.timeline || "To be confirmed")}</dd>
					</div>
					<div>
						<dt>Priority</dt>
						<dd>{String(brief.priority || "To be confirmed")}</dd>
					</div>
					<div>
						<dt>Launch status</dt>
						<dd>{String(brief.launchStatus || "To be confirmed")}</dd>
					</div>
				</dl>
			</section>
			{section("Open questions", brief.openQuestions)}
			{section("Next steps", brief.nextSteps)}
			<p className="draft-disclaimer">
				{String(
					brief.disclaimer ||
						"Preliminary AI-assisted draft. Not a quote or delivery commitment.",
				)}
			</p>
		</div>
	);
}

export default function App() {
	let stored: any = null;
	if (typeof window !== "undefined") {
		const threadSession = Boolean(
			sessionStorage.getItem("cynbit_thread_session"),
		);
		if (!threadSession) {
			localStorage.removeItem("cynbit_identity");
			localStorage.removeItem("cynbit_thread");
		} else {
			try {
				stored = JSON.parse(localStorage.getItem("cynbit_identity") || "null");
			} catch (error) {
				console.error("Could not restore the saved identity:", error);
				localStorage.removeItem("cynbit_identity");
			}
		}
		sessionStorage.setItem("cynbit_thread_session", "1");
	}
	const [step, setStep] = useState<"details" | "otp" | "chat">(
		stored?.token ? "chat" : "details",
	);
	const [name, setName] = useState(stored?.name || "");
	const [email, setEmail] = useState(stored?.email || "");
	const [company, setCompany] = useState(stored?.company || "");
	const [consent, setConsent] = useState(true);
	const [otp, setOtp] = useState("");
	const [token, setToken] = useState(stored?.token || "");
	const [status, setStatus] = useState("");
	const [loading, setLoading] = useState(false);
	const initialGreeting: Message = {
		role: "assistant",
		content: `Hi${stored?.name ? " " + stored.name : ""}. Tell me about the goal you have in mind. I’ll ask one focused question at a time and turn the conversation into a project brief for the Cynbit team.`,
	};
	let restoredMessages: Message[] | null = null;
	if (typeof window !== "undefined") {
		try {
			const saved = JSON.parse(localStorage.getItem("cynbit_thread") || "null");
			if (Array.isArray(saved?.messages) && saved.messages.length)
				restoredMessages = saved.messages;
		} catch (error) {
			console.error("Could not restore the current thread:", error);
		}
	}
	const [messages, setMessages] = useState<Message[]>(
		restoredMessages || [initialGreeting],
	);
	const [input, setInput] = useState("");
	const [sources, setSources] = useState<string[]>([]);
	const [brief, setBrief] = useState<Record<string, unknown> | null>(null);
	const [draftOpen, setDraftOpen] = useState(false);
	const [reviewLoading, setReviewLoading] = useState(false);
	const [finalizing, setFinalizing] = useState(false);
	const [finalStatus, setFinalStatus] = useState("");
	const chatAreaRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		if (token && messages.length) {
			localStorage.setItem("cynbit_thread", JSON.stringify({ messages }));
		}
	}, [messages, token]);
	useEffect(() => {
		if (messages.length > 1 && chatAreaRef.current) {
			chatAreaRef.current.scrollTo({
				top: chatAreaRef.current.scrollHeight,
				behavior: "auto",
			});
		}
	}, [messages, loading]);

	async function sendOtp(e: React.FormEvent) {
		e.preventDefault();
		setStatus("");
		if (!consent) {
			setStatus(
				"Please agree to save this conversation and share the project report with Cynbit.",
			);
			return;
		}
		setLoading(true);
		try {
			const response = await fetch("/api/auth/otp/send", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, email, company, consent }),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "Could not send code");
			setStep("otp");
			setStatus("We sent a 6-digit code to your email.");
		} catch (error) {
			console.error("OTP request failed:", error);
			setStatus(error instanceof Error ? error.message : "Could not send code");
		} finally {
			setLoading(false);
		}
	}

	async function verifyOtp(e: React.FormEvent) {
		e.preventDefault();
		setStatus("");
		setLoading(true);
		try {
			const response = await fetch("/api/auth/otp/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, email, company, consent, otp }),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "Verification failed");
			const identity = { ...data.contact, token: data.token };
			localStorage.setItem("cynbit_identity", JSON.stringify(identity));
			setToken(data.token);
			setName(data.contact.name);
			setEmail(data.contact.email);
			setCompany(data.contact.company || "");
			setStep("chat");
			setStatus("");
			setTimeout(() => inputRef.current?.focus(), 100);
		} catch (error) {
			console.error("OTP verification failed:", error);
			setStatus(error instanceof Error ? error.message : "Verification failed");
		} finally {
			setLoading(false);
		}
	}

	async function openReview() {
		setReviewLoading(true);
		setBrief(null);
		setDraftOpen(true);
		setFinalStatus("");
		try {
			const response = await fetch("/api/brief", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sessionToken: token,
					messages: messages.filter((message) => message.content.trim()),
				}),
			});
			const data = await response.json();
			if (!response.ok)
				throw new Error(data.error || "Could not generate the project brief");
			setBrief(data.brief || null);
			setSources(data.sources || []);
		} catch (error) {
			console.error("Brief generation failed:", error);
			setFinalStatus(
				error instanceof Error
					? error.message
					: "Could not generate the project brief. Please try again.",
			);
		} finally {
			setReviewLoading(false);
		}
	}

	async function finalizeBrief() {
		if (finalizing) return;
		setFinalizing(true);
		setFinalStatus("");
		try {
			const response = await fetch("/api/brief/finalize", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionToken: token, messages }),
			});
			const data = await response.json();
			if (!response.ok)
				throw new Error(data.error || "Could not send the final brief");
			if (data.brief) setBrief(data.brief);
			setFinalStatus(
				data.alreadySent
					? "The final brief was already sent to the Cynbit team."
					: "Final brief sent to the Cynbit team.",
			);
		} catch (error) {
			console.error("Final brief submission failed:", error);
			setFinalStatus(
				error instanceof Error
					? error.message
					: "Could not send the final brief.",
			);
		} finally {
			setFinalizing(false);
		}
	}

	async function sendMessage(text = input) {
		const clean = text.trim();
		if (!clean || loading) return;
		setBrief(null);
		const prior = [...messages];
		const updated = [
			...prior,
			{ role: "user" as const, content: clean },
			{ role: "assistant" as const, content: "" },
		];
		setMessages(updated);
		setInput("");
		if (inputRef.current) inputRef.current.style.height = "auto";
		setLoading(true);
		let completed = false;
		try {
			const response = await fetch("/api/chat/stream", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					message: clean,
					history: prior.slice(1),
					sessionToken: token,
				}),
			});
			if (!response.ok) {
				let message = "Could not reach the consultant";
				try {
					message = (await response.json()).error || message;
				} catch {}
				throw new Error(message);
			}
			if (!response.body)
				throw new Error("Streaming is not supported by this browser");
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let answer = "";
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const chunks = buffer.split(/\r?\n\r?\n/);
				buffer = chunks.pop() || "";
				for (const chunk of chunks) {
					let event = "message";
					let data = "";
					for (const line of chunk.split(/\r?\n/)) {
						if (line.startsWith("event:")) event = line.slice(6).trim();
						else if (line.startsWith("data:")) data += line.slice(5).trim();
					}
					if (!data) continue;
					try {
						const payload = JSON.parse(data);
						if (event === "done") {
							completed = true;
							setSources(payload.sources || []);
						} else if (event === "error")
							throw new Error(payload.message || "Chat failed");
						else {
							answer += payload.token || "";
							setMessages([
								...updated.slice(0, -1),
								{ role: "assistant", content: answer },
							]);
						}
					} catch (error) {
						if (error instanceof Error && event === "error") throw error;
						console.error("Invalid chat stream payload:", data, error);
						throw new Error(
							"The chat response was interrupted. Please try again.",
						);
					}
				}
			}
			if (!completed && !answer.trim())
				throw new Error("The chat response ended before it was complete.");
		} catch (error) {
			console.error("Chat stream failed:", error);
			setMessages([
				...updated.slice(0, -1),
				{ role: "assistant", content: answerText(error) },
			]);
		} finally {
			setLoading(false);
			inputRef.current?.focus();
		}
	}

	function answerText(error: unknown) {
		return `I couldn’t complete that response. ${error instanceof Error ? error.message : "Please try again."}`;
	}

	function reset() {
		localStorage.removeItem("cynbit_identity");
		localStorage.removeItem("cynbit_thread");
		setToken("");
		setName("");
		setEmail("");
		setCompany("");
		setOtp("");
		setBrief(null);
		setDraftOpen(false);
		setFinalStatus("");
		setMessages([
			{
				role: "assistant",
				content:
					"Hi. Tell me about the goal you have in mind and I’ll help turn it into a clear project brief.",
			},
		]);
		setStep("details");
	}

	if (step === "details" || step === "otp")
		return (
			<main className="verify-page">
				<section className="verify-card">
					<a
						className="verify-brand"
						href="https://www.cynbit.in/"
						target="_blank"
					>
						<span>
							<Sparkles size={18} />
						</span>
						CYNBIT
					</a>
					<div className="verify-copy">
						<div className="eyebrow">PROJECT DISCOVERY</div>
						<h1>
							{step === "details"
								? "Start with who you are."
								: "Check your email."}
						</h1>
						<p>
							{step === "details"
								? "A verified identity helps us prepare a useful project brief and keeps the conversation connected to your company."
								: "Enter the 6-digit code we sent to your inbox. It is valid for a short time."}
						</p>
					</div>
					{step === "details" ? (
						<form onSubmit={sendOtp} className="verify-form">
							<label>
								Full name
								<input
									value={name}
									onChange={(e) => setName(e.target.value)}
									required
									minLength={2}
									placeholder="Jane Smith"
									autoComplete="name"
								/>
							</label>
							<label>
								Work email
								<div className="input-with-icon">
									<Mail size={16} />
									<input
										type="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										required
										placeholder="jane@company.com"
										autoComplete="email"
									/>
								</div>
							</label>
							<label>
								Company
								<input
									value={company}
									onChange={(e) => setCompany(e.target.value)}
									placeholder="Company name (optional)"
									autoComplete="organization"
								/>
							</label>
							<label className="consent">
								<input
									type="checkbox"
									checked={consent}
									onChange={(e) => setConsent(e.target.checked)}
								/>
								<span>
									I agree to save this conversation so the Cynbit product team
									can receive one final project brief when I submit it.
								</span>
							</label>
							<button className="primary" disabled={loading}>
								{loading ? (
									<LoaderCircle className="spin" />
								) : (
									<>
										<ShieldCheck size={17} /> Send verification code{" "}
										<ChevronRight size={16} />
									</>
								)}
							</button>
						</form>
					) : (
						<form onSubmit={verifyOtp} className="verify-form">
							<label>
								Verification code
								<input
									className="otp-input"
									value={otp}
									onChange={(e) =>
										setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
									}
									inputMode="numeric"
									required
									pattern="[0-9]{6}"
									placeholder="000000"
								/>
							</label>
							<button
								className="primary"
								disabled={loading || otp.length !== 6}
							>
								{loading ? (
									<LoaderCircle className="spin" />
								) : (
									<>
										<ShieldCheck size={17} /> Verify and start
									</>
								)}
							</button>
							<button
								type="button"
								className="text-button"
								onClick={() => setStep("details")}
							>
								Use a different email
							</button>
						</form>
					)}
					{status && (
						<p className="status" role="status">
							{status}
						</p>
					)}
				</section>
			</main>
		);

	return (
		<main className="chat-page">
			<header className="chat-header">
				<a
					className="verify-brand"
					href="https://www.cynbit.in/"
					target="_blank"
				>
					<span>
						<Sparkles size={17} />
					</span>
					CYNBIT
				</a>
				<div className="identity">
					<span className="verified">
						<Check size={12} /> Verified
					</span>
					<strong>{name}</strong>
					<small>{company || email}</small>
				</div>
				<div className="header-actions">
					<button
						className="finalize-button"
						onClick={openReview}
						disabled={reviewLoading}
					>
						{reviewLoading ? (
							<>
								<LoaderCircle className="spin" size={15} /> Generating brief
							</>
						) : (
							<>
								<Mail size={15} /> Review & send
							</>
						)}
					</button>
					<button className="reset" onClick={reset} title="Start over">
						<RotateCcw size={16} />
					</button>
				</div>
			</header>
			<section className="chat-shell">
				<div className="conversation-header">
					<div>
						<span className="eyebrow">YOUR PROJECT</span>
						<h2>Let’s shape the brief</h2>
					</div>
					<div className="auto-save">
						<Check size={14} />
						<span>
							<strong>Current thread saved locally</strong>
							<small>The project brief is created only when you review</small>
						</span>
					</div>
				</div>
				<div className="chat-area" ref={chatAreaRef}>
					{messages.map((message, index) => (
						<div className={`message ${message.role}`} key={index}>
							<div className="avatar">
								{message.role === "assistant" ? (
									<Sparkles size={15} />
								) : (
									name.slice(0, 1).toUpperCase()
								)}
							</div>
							<div className="message-body">
								<div className="message-name">
									{message.role === "assistant" ? "Cynbit consultant" : "You"}
								</div>
								<div className="bubble">
									<MessageText content={message.content} />
								</div>
							</div>
						</div>
					))}
					{messages.length === 1 && !loading && (
						<div className="starter-prompts">
							<button
								onClick={() =>
									sendMessage(
										"I need to improve customer engagement and lead follow-up.",
									)
								}
							>
								Improve customer engagement
							</button>
							<button
								onClick={() =>
									sendMessage("We want to automate a manual business process.")
								}
							>
								Automate a workflow
							</button>
							<button
								onClick={() =>
									sendMessage("I want to build a new web or mobile product.")
								}
							>
								Build a new product
							</button>
						</div>
					)}
					{loading && messages[messages.length - 1]?.content === "" && (
						<div className="thinking">
							<span />
							<span />
							<span /> Preparing your next question
						</div>
					)}
				</div>
				<div className="composer-area">
					<form
						className="composer"
						onSubmit={(e) => {
							e.preventDefault();
							sendMessage();
						}}
					>
						<textarea
							ref={inputRef}
							value={input}
							onChange={(e) => {
								setInput(e.target.value);
								e.currentTarget.style.height = "auto";
								e.currentTarget.style.height =
									Math.min(e.currentTarget.scrollHeight, 140) + "px";
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									sendMessage();
								}
							}}
							placeholder="Describe your goal, challenge, users, or current system…"
							rows={2}
							maxLength={4000}
						/>
						<button
							aria-label="Send message"
							disabled={!input.trim() || loading}
						>
							{loading ? (
								<LoaderCircle className="spin" size={17} />
							) : (
								<Send size={18} />
							)}
						</button>
					</form>
					<div className="composer-note">
						<span>
							{sources.length
								? "Grounded in " +
									sources.length +
									" Cynbit knowledge section" +
									(sources.length === 1 ? "" : "s")
								: "Your conversation stays private until the verified team report is sent"}
						</span>
						<span>{input.length}/4000</span>
					</div>
				</div>
			</section>
			<aside className="brief-note">
				<span className="eyebrow">DISCOVERY PATH</span>
				<ol>
					<li>
						<b>Goal</b>
						<small>What should improve?</small>
					</li>
					<li>
						<b>Context</b>
						<small>Users, systems, constraints</small>
					</li>
					<li>
						<b>Direction</b>
						<small>Relevant product or service</small>
					</li>
					<li>
						<b>Project brief</b>
						<small>Saved now; sent after your review</small>
					</li>
				</ol>
				<a href="https://www.cynbit.in/services" target="_blank">
					Explore Cynbit services <ArrowUpRight size={14} />
				</a>
			</aside>
			{draftOpen && (
				<div
					className="draft-overlay"
					role="dialog"
					aria-modal="true"
					aria-label="Project brief draft"
				>
					<div className="draft-panel">
						<header>
							<div>
								<span className="eyebrow">PROJECT DRAFT</span>
								<h2>
									{brief
										? String(brief.projectTitle || "Preliminary project brief")
										: "Preparing project brief"}
								</h2>
							</div>
							<button
								aria-label="Close draft"
								onClick={() => setDraftOpen(false)}
							>
								<X size={18} />
							</button>
						</header>
						{reviewLoading ? (
							<div className="draft-loading">
								<LoaderCircle className="spin" /> Reading the full conversation
								and preparing your brief…
							</div>
						) : brief ? (
							<DraftView brief={brief} />
						) : (
							<div className="draft-loading">
								<p role="status">
									{finalStatus || "Could not prepare the brief."}
								</p>
							</div>
						)}
						<footer className="draft-footer">
							<p role="status">{finalStatus}</p>
							<button
								className="primary"
								onClick={finalizeBrief}
								disabled={
									finalizing ||
									!brief ||
									finalStatus.startsWith("Final brief sent") ||
									finalStatus ===
										"The final brief was already sent to the Cynbit team."
								}
							>
								{finalizing ? (
									<LoaderCircle className="spin" size={17} />
								) : (
									<Mail size={17} />
								)}{" "}
								{finalStatus || "Submit final brief"}
							</button>
						</footer>
					</div>
				</div>
			)}
		</main>
	);
}
