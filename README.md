# Claude Code as an MCP Server on Render (for n8n)

## Why this exists
Claude Code's built-in MCP server mode (`claude mcp serve`) only speaks **stdio** —
it has to be launched locally by whatever connects to it. It can't be reached
over a network URL. This project wraps headless Claude Code in a small HTTP/MCP
server so that a *remote* client — like n8n's MCP Client node — can call it.

## What's in here
- `Dockerfile` — installs Node + Claude Code CLI into a container
- `server.js` — Express app exposing one MCP tool (`run_claude_code`) over
  HTTP, protected by a bearer token
- `render.yaml` — Render Blueprint for a Docker web service

## 1. Get an Anthropic API key
Headless/server use needs API billing, not a Pro/Max login (there's no
browser to complete OAuth on a server).
- Get a key from the Claude Console: https://console.anthropic.com/settings/keys

## 2. Push this folder to GitHub
```bash
cd claude-code-mcp-render
git init
git add .
git commit -m "Claude Code MCP server for Render"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

## 3. Deploy on Render
1. Dashboard → **New** → **Blueprint** → connect your repo (uses `render.yaml`).
2. Once created, open the `claude-code-mcp` service → **Environment** and set:
   - `ANTHROPIC_API_KEY` = your key from step 1
   - `MCP_AUTH_TOKEN` = any long random string you generate yourself (this is
     the password n8n will use to call your server — treat it like a secret)
3. Deploy. You'll get a URL like `https://claude-code-mcp-xxxx.onrender.com`.

**Note on plan:** this uses `plan: starter` (paid) because Claude Code runs
need real CPU/time and the free tier's spin-down would break long-running
calls mid-request. Keep it alive the same way as your other service —
an external pinger (e.g. UptimeRobot) hitting `/health` — no cron job needed
here since Render Cron Jobs still requires a paid plan and you said you're
going the external-ping route.

## 4. Connect n8n to it
In n8n, add an **MCP Client** node (or the AI Agent node's MCP tool option):
- **Server URL:** `https://claude-code-mcp-xxxx.onrender.com/mcp`
- **Transport:** HTTP (Streamable HTTP)
- **Headers:** `Authorization: Bearer <your MCP_AUTH_TOKEN>`

Once connected, n8n will see one tool, `run_claude_code`, which takes a
`prompt` string. You can now have an n8n AI Agent node call it with prompts
like:

> "Create an n8n workflow JSON that watches a Gmail inbox and posts new
> emails to a Slack channel. Save it as workflow.json in the workspace."

Claude Code will reason and (if you also give it n8n API credentials/tools)
can even call your n8n instance's REST API directly to create the workflow
for you, rather than just returning JSON for you to paste in.

## Security notes (read before deploying)
- `--dangerously-skip-permissions` is used because this runs headless with no
  human to approve actions — that's normal for automation, but it means
  Claude Code can execute file/shell operations inside the container
  without asking. The `MCP_AUTH_TOKEN` is what stands between "only my n8n
  can trigger this" and "anyone with the URL can." Keep it secret, rotate it
  if it ever leaks.
- Claude Code here only touches its own container's `/app/workspace` — it
  has no access to your n8n server's filesystem or other services unless you
  explicitly give it credentials/tools to call them.
- Don't commit `ANTHROPIC_API_KEY` or `MCP_AUTH_TOKEN` to git — set them only
  in Render's dashboard env vars, as configured above.

## Local test (optional, before deploying)
```bash
docker build -t claude-code-mcp .
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e MCP_AUTH_TOKEN=test-token-123 \
  claude-code-mcp

curl http://localhost:3000/health
```
