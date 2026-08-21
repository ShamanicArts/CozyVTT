import { productionQueryHost } from "./productionQueryHost";
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
