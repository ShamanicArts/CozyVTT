export function activateMapRenderer(api) {
  return api.registerLayer({
    id: "lantern-glow",
    surface: "overlay",
    order: 500,
    render({ context, canvas, map }) {
      if (!context || !canvas || !map) return;
      const radius = Math.max(90, Math.min(canvas.width, canvas.height) * 0.16);
      const x = canvas.width - radius * 0.75;
      const y = radius * 0.75;
      const glow = context.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, "rgba(255, 204, 107, 0.22)");
      glow.addColorStop(1, "rgba(255, 204, 107, 0)");
      context.save();
      context.fillStyle = glow;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(255, 225, 165, 0.78)";
      context.font = "12px sans-serif";
      context.textAlign = "right";
      context.fillText("Lantern Echo", canvas.width - 14, 22);
      context.restore();
    },
  });
}
