import {
  productionPublicQueryHost,
  productionQueryHost,
} from "./productionQueryHost";
it("catalogs unique read queries with JSON schemas", () => {
  const catalog = productionQueryHost.list();
  expect(catalog).toHaveLength(13);
  expect(new Set(catalog.map((query) => query.id)).size).toBe(catalog.length);
  for (const query of catalog) {
    expect(query).toMatchObject({
      risk: "READ",
      inputSchema: { type: "object" },
    });
    expect(query.outputSchema).toEqual(
      expect.objectContaining({ type: expect.anything() }),
    );
  }
});

it("keeps the delegated query catalogue finite and fully described", () => {
  const catalog = productionPublicQueryHost.list();
  expect(catalog.length).toBeGreaterThan(0);
  expect(catalog.length).toBeLessThan(productionQueryHost.list().length);
  for (const query of catalog) {
    expect(query).toMatchObject({
      version: "1",
      requiredPermissions: ["READ"],
      extensionPermissions: ["campaign.read"],
      resultRedactionPolicy: expect.any(String),
      bounds: { maxResultBytes: expect.any(Number) },
    });
  }
});
