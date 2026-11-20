import "dotenv/config";
import { google } from "googleapis";

const id = process.env.GOOGLE_CLIENT_ID;
const secret = process.env.GOOGLE_CLIENT_SECRET;
if (!id || !secret) throw new Error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first");

const auth = new google.auth.OAuth2(
  id,
  secret,
  process.env.GOOGLE_REDIRECT_URI || "http://localhost",
);
const [command, code] = process.argv.slice(2);
const scopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
];

if (command === "url") {
  process.stdout.write(
    `${auth.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: scopes })}\n`,
  );
} else if (command === "exchange" && code) {
  const { tokens } = await auth.getToken(code);
  if (!tokens.refresh_token)
    throw new Error(
      "Google returned no refresh token. Revoke prior access and authorize again with prompt=consent.",
    );
  process.stdout.write(
    `Add this value to .env as GOOGLE_REFRESH_TOKEN:\n${tokens.refresh_token}\n`,
  );
} else {
  process.stderr.write(
    "Usage: npm run google:auth-url | npm run google:exchange -- <authorization-code>\n",
  );
  process.exit(2);
}
