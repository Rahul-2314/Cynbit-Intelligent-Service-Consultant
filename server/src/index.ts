import express from "express";
import cors from "cors";
import { ZodError } from "zod";
import path from "node:path";
import { existsSync } from "node:fs";
import { env } from "./config/env.js";
import { api } from "./routes/api.js";
import { initDatabase } from "./services/database.js";
const app = express();
app.use(
	cors({
		origin: env.clientOrigin.split(",").map((s) => s.trim()),
		methods: ["GET", "POST"],
		allowedHeaders: ["Content-Type"],
	}),
);
app.use(express.json({ limit: "1mb" }));
app.get("/", (_req, res) =>
	res.json({
		name: "Cynbit Intelligent Service Consultant",
		api: "/api/health",
	}),
);
app.use("/api", api);
// In production, the Express server can also serve the built Vite app from the same deployment.
const clientDist = path.resolve(process.cwd(), "../client/dist");
if (existsSync(clientDist)) {
	app.use(express.static(clientDist));
	app.get("*", (_req, res) =>
		res.sendFile(path.join(clientDist, "index.html")),
	);
}
app.use(
	(
		error: unknown,
		_req: express.Request,
		res: express.Response,
		_next: express.NextFunction,
	) => {
		if (error instanceof ZodError)
			return res
				.status(400)
				.json({
					error: "Please check the submitted fields.",
					details: error.issues.map((i) => ({
						path: i.path.join("."),
						message: i.message,
					})),
				});
		const message = error instanceof Error ? error.message : "";
		if (/self-signed|certificate|database|postgres|connection/i.test(message)) {
			console.error("Service connection error:", message);
			return res
				.status(503)
				.json({
					error:
						"The verification service is temporarily unavailable. Please try again in a moment.",
				});
		}
		console.error(error);
		return res
			.status(500)
			.json({ error: message || "Unexpected server error" });
	},
);
async function start() {
	try {
		await initDatabase();
		console.log("PostgreSQL initialized");
	} catch (error) {
		console.warn(
			"PostgreSQL unavailable:",
			error instanceof Error ? error.message : error,
		);
	}
	app.listen(env.port, () =>
		console.log(
			`Cynbit Intelligent Service Consultant API running at http://localhost:${env.port}`,
		),
	);
}
void start();
