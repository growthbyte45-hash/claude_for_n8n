FROM node:20-slim

# Claude Code's native installer needs curl and bash
RUN apt-get update && apt-get install -y curl bash git ripgrep && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI (native installer)
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

# Where Claude Code will treat as its working directory when generating n8n workflow files
RUN mkdir -p /app/workspace

EXPOSE 3000
CMD ["node", "server.js"]
