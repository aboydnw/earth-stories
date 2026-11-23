/** Shared crop contract for the interactive canvas and generated-scene inspection. */
export function sceneViewport(
  scene: { width: number; height: number; focalX?: number },
  ratio: number,
) {
  const width = Math.min(scene.width, scene.height * ratio),
    height = Math.min(scene.height, scene.width / ratio);
  return {
    x: Math.max(
      0,
      Math.min(
        scene.width - width,
        scene.width * (scene.focalX ?? 0.7) - width / 2,
      ),
    ),
    y: (scene.height - height) / 2,
    width,
    height,
  };
}
