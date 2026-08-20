import { rehydrateConfiguredExtensions } from "./ExtensionRuntimeStartup";

describe("rehydrateConfiguredExtensions", () => {
  it("leaves extension-disabled deployments untouched", async () => {
    const rehydrate = jest.fn<Promise<void>, []>();

    await expect(
      rehydrateConfiguredExtensions({}, () => ({ rehydrate }) as never),
    ).resolves.toBe(false);
    expect(rehydrate).not.toHaveBeenCalled();
  });

  it("rehydrates configured package hosts before startup", async () => {
    const rehydrate = jest.fn<Promise<void>, []>().mockResolvedValue();

    await expect(
      rehydrateConfiguredExtensions(
        { EXTENSION_PACKAGE_ROOT: "/srv/cozyvtt/extensions" },
        () => ({ rehydrate }) as never,
      ),
    ).resolves.toBe(true);
    expect(rehydrate).toHaveBeenCalledTimes(1);
  });

  it("contains rehydration failures so the base VTT can still start", async () => {
    const rehydrate = jest
      .fn<Promise<void>, []>()
      .mockRejectedValue(new Error("invalid extension package"));

    await expect(
      rehydrateConfiguredExtensions(
        { EXTENSION_PACKAGE_ROOT: "/srv/cozyvtt/extensions" },
        () => ({ rehydrate }) as never,
      ),
    ).resolves.toBe(false);
  });
});
