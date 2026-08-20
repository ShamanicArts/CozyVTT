# Development Dockerfile
# For production, use Dockerfile.prod (multi-stage, non-root, compiled output)
FROM node:24-bookworm-slim

# Node 24 LTS provides the permission model used by the sandbox runner.
# bubblewrap is the OS boundary for sandboxed extension packages.
# bash is required by start.sh; postgresql-client provides pg_dump and psql.
RUN apt-get update \
  && apt-get install --no-install-recommends -y bash bubblewrap gosu openssl postgresql-client \
  && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system appgroup && useradd --system --gid appgroup appuser

WORKDIR /app

# Install dependencies as root (need write access to node_modules)
COPY package*.json ./
RUN npm ci

# Copy application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Copy and fix startup script
COPY scripts/start.sh /usr/local/bin/start.sh
RUN sed -i 's/\r$//' /usr/local/bin/start.sh && chmod +x /usr/local/bin/start.sh

# Create uploads and logs dirs, hand ownership to appuser
RUN mkdir -p /app/uploads /app/logs && chown -R appuser:appgroup /app

EXPOSE 4000

ENTRYPOINT ["/usr/local/bin/start.sh"]
CMD ["npm", "run", "dev"]
