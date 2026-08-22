const manifest = require("./cozyvtt.extension.json").manifest;

async function echo(input) {
  const message = input?.message;
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("message must be a non-empty string");
  }
  return {
    echo: message.trim(),
    source: "cozyvtt.sample-lantern",
  };
}

const extension = {
  manifest,
  commandHandlers: { "lantern.echo": echo },
};

module.exports = extension;

if (require.main === module) {
  const readline = require("readline");
  const lines = readline.createInterface({ input: process.stdin });
  lines.once("line", async (line) => {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      respond("invalid", false, undefined, {
        code: "INVALID_REQUEST",
        message: "Request was not valid JSON",
      });
      return;
    }

    if (request.method === "activate" || request.method === "deactivate") {
      respond(request.id, true, { state: request.method });
      return;
    }

    if (
      request.method === "command" &&
      request.params?.commandId === "lantern.echo"
    ) {
      try {
        respond(request.id, true, await echo(request.params?.input));
      } catch (error) {
        respond(request.id, false, undefined, {
          code: "INVALID_INPUT",
          message: error instanceof Error ? error.message : "Invalid input",
        });
      }
      return;
    }

    respond(request.id, false, undefined, {
      code: "UNKNOWN_METHOD",
      message: "The sample extension does not implement that operation",
    });
  });
}

function respond(id, ok, result, error) {
  process.stdout.write(
    `${JSON.stringify({ version: 1, id, ok, result, error })}\n`,
  );
}
