import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
export const env = {
	port: Number(process.env.PORT || 4000),
	clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
	groqApiKey: process.env.GROQ_API_KEY || "",
	groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
	resendApiKey: process.env.RESEND_API_KEY || "",
	teamEmail: process.env.TEAM_EMAIL || "opportunities@cynbit.in",
	fromEmail:
		process.env.FROM_EMAIL ||
		"Cynbit Service Consultant <onboarding@resend.dev>",
	databaseUrl: process.env.DATABASE_URL || "",
	otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES || 10),
};
