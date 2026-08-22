export function activateMapRenderer(api) {
  return api.registerLayer({
    id: "lantern-glow",
    surface: "overlay",
    order: 500,
    render({ context, canvas, map }) {
      if (!context || !canvas || !map) return;
      const radius = Math.max(130, Math.min(canvas.width, canvas.height) * 0.24);
      const x = canvas.width * 0.38;
      const y = canvas.height * 0.34;
      const glow = context.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, "rgba(255, 204, 107, 0.42)");
      glow.addColorStop(0.45, "rgba(255, 178, 72, 0.2)");
      glow.addColorStop(1, "rgba(255, 204, 107, 0)");
      context.save();
      context.globalCompositeOperation = "screen";
      context.fillStyle = glow;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.globalCompositeOperation = "source-over";
      context.fillStyle = "rgba(20, 28, 30, 0.88)";
      context.fillRect(12, canvas.height - 36, 126, 24);
      context.strokeStyle = "rgba(255, 204, 107, 0.8)";
      context.strokeRect(12.5, canvas.height - 35.5, 125, 23);
      context.fillStyle = "rgba(255, 225, 165, 0.96)";
      context.font = "600 12px sans-serif";
      context.textAlign = "left";
      context.fillText("Lantern Glow active", 20, canvas.height - 20);
      context.restore();
    },
  });
}
