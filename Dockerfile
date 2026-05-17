FROM oven/bun:1-slim

# Install any underlying Debian dependencies you might need for shell commands
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --production

# Copy application code
COPY src ./src
COPY tsconfig.json ./

# Create the sandboxed brain directory and adjust permissions
RUN mkdir -p /app/brain && chmod 777 /app/brain

ENV NODE_ENV=production

# Execute the agent
CMD ["bun", "run", "src/index.ts"]