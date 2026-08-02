import express from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN; // required — protects this endpoint
const WORKSPACE = "/app/workspace";

if (!AUTH_TOKEN) {
  console.error("FATAL: MCP_AUTH_TOKEN env var is not set. Refusing to start unprotected.");
  process.exit(1);
}

// --- Build the MCP server and its single tool ---
function buildMcpServer() {
  const server = new McpServer({ name: "claude-code-render", version: "1.0.0" });

  server.registerTool(
    "run_claude_code",
    {
      title: "Run Claude Code",
      description:
        "Runs Claude Code headlessly against a prompt, inside a sandboxed workspace directory on this server. " +
        "Use this to generate, edit, or explain n8n workflow JSON, scripts, or any coding task. " +
        "Returns Claude's final text output.",
      inputSchema: {
        prompt: z.string().describe("The instruction/task for Claude Code to carry out"),
      },
    },
    async ({ prompt }) => {
      try {
        const { stdout } = await execFileAsync(
          "claude",
          ["-p", prompt, "--dangerously-skip-permissions", "--output-format", "text"],
          { cwd: WORKSPACE, timeout: 1000 * 60 * 5, maxBuffer: 1024 * 1024 * 20 }
        );
        return { content: [{ type: "text", text: stdout }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error running Claude Code: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

const app = express();
app.use(express.json());

// Bearer-token auth on the MCP endpoint
function requireAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// Health check (no auth — used for uptime pings)
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

// MCP endpoint — stateless: new server+transport per request
app.post("/mcp", requireAuth, async (req, res) => {
  try {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Claude Code MCP server listening on port ${PORT}`);
});
