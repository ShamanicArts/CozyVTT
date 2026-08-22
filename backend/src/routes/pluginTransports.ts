import { Router } from "express";
import { productionHttpTransportRegistry } from "../composition/productionExtensionRuntime";

const router = Router();

router.all("/:extensionId/*", async (req, res, next) => {
  try {
    const wildcard = (req.params as Record<string, string | undefined>)["0"];
    const path = `/${wildcard ?? ""}`;
    const url = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) for (const item of value) headers.append(name, item);
      else if (value !== undefined) headers.set(name, value);
    }
    let body: Buffer | string | undefined;
    if (req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined) {
      body = Buffer.isBuffer(req.body)
        ? req.body
        : typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body);
    }
    const response = await productionHttpTransportRegistry.dispatch(
      req.params.extensionId,
      path,
      new Request(url, { method: req.method, headers, body }),
    );
    response.headers.forEach((value, name) => res.setHeader(name, value));
    return res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    return next(error);
  }
});

export default router;
