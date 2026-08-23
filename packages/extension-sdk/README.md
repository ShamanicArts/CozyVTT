# CozyVTT extension SDK

This package contains the public, transport-independent contract used by local
CozyVTT extensions. It intentionally exports no Prisma, Express, Socket.IO,
React, filesystem, or application-internal modules.

Extensions may discover and invoke campaign-scoped core commands and queries
through `context.core`. Transport adapters and external runtimes are separate
packages built against this public contract; they are not part of CozyVTT Core.
