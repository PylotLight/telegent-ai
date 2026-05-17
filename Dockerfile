# Stage 1: Build & Dependencies
FROM oven/bun:1-slim AS builder
WORKDIR /app
# Use wildcard to safely copy bun.lockb if it exists
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .

# Stage 2: Minimal Runtime
FROM oven/bun:1-slim
WORKDIR /app

# Install shell deps
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    procps \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json /app/tsconfig.json ./

# Create the brain volume point
RUN mkdir -p /app/brain && chmod 777 /app/brain

ENV NODE_ENV=production

# Execute the agent
CMD ["bun", "run", "src/index.ts"]