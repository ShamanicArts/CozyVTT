# CozyVTT extension SDK

This package contains the public, transport-independent contract used by local
CozyVTT extensions. It intentionally exports no Prisma, Express, Socket.IO,
React, filesystem, or application-internal modules.

Extensions may discover and invoke campaign-scoped core commands and queries
through `context.core`. External harnesses see the same commands and queries
through MCP/API. The SDK does not provide an agent runtime, model provider,
memory system, or scheduler.
