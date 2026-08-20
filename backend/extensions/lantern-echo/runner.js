const readline = require("readline");

function respond(id, ok, result, error) {
  process.stdout.write(
    `${JSON.stringify({ version: 1, id, ok, result, error })}\n`,
  );
}

const lines = readline.createInterface({ input: process.stdin });
lines.once("line", (line) => {
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
    const message = request.params?.input?.message;
    if (typeof message !== "string" || !message.trim()) {
      respond(request.id, false, undefined, {
        code: "INVALID_INPUT",
        message: "message must be a non-empty string",
      });
      return;
    }
    respond(request.id, true, {
      echo: message.trim(),
      source: "cozyvtt.sample-lantern",
    });
    return;
  }

  respond(request.id, false, undefined, {
    code: "UNKNOWN_METHOD",
    message: "The sample extension does not implement that operation",
  });
});
