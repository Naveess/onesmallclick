// The design's ten 9×9 UI icons, copied from design/icons/*.svg (exported from buildIcons()).
// Each is one path in a 9×9 grid, drawn with currentColor by PixelIcon.

export const ICON_PATHS = {
  bolt: "M5 0h2v1h-2zM4 1h2v1h-2zM3 2h2v1h-2zM2 3h6v1h-6zM5 4h2v1h-2zM4 5h2v1h-2zM3 6h2v1h-2zM2 7h2v1h-2z",
  check: "M8 1h1v1h-1zM7 2h2v1h-2zM0 3h1v1h-1zM6 3h2v1h-2zM0 4h2v1h-2zM5 4h2v1h-2zM1 5h2v1h-2zM4 5h2v1h-2zM2 6h3v1h-3zM3 7h1v1h-1z",
  clock: "M2 0h5v1h-5zM1 1h1v1h-1zM7 1h1v1h-1zM0 2h1v1h-1zM4 2h1v1h-1zM8 2h1v1h-1zM0 3h1v1h-1zM4 3h1v1h-1zM8 3h1v1h-1zM0 4h1v1h-1zM4 4h3v1h-3zM8 4h1v1h-1zM0 5h1v1h-1zM8 5h1v1h-1zM1 6h1v1h-1zM7 6h1v1h-1zM2 7h5v1h-5z",
  log: "M1 0h7v1h-7zM1 1h1v1h-1zM7 1h1v1h-1zM1 2h1v1h-1zM3 2h3v1h-3zM7 2h1v1h-1zM1 3h1v1h-1zM7 3h1v1h-1zM1 4h1v1h-1zM3 4h3v1h-3zM7 4h1v1h-1zM1 5h1v1h-1zM7 5h1v1h-1zM1 6h1v1h-1zM3 6h2v1h-2zM7 6h1v1h-1zM1 7h7v1h-7z",
  mail: "M0 0h9v1h-9zM0 1h2v1h-2zM7 1h2v1h-2zM0 2h1v1h-1zM2 2h1v1h-1zM6 2h1v1h-1zM8 2h1v1h-1zM0 3h1v1h-1zM3 3h1v1h-1zM5 3h1v1h-1zM8 3h1v1h-1zM0 4h1v1h-1zM4 4h1v1h-1zM8 4h1v1h-1zM0 5h1v1h-1zM8 5h1v1h-1zM0 6h9v1h-9z",
  signal: "M2 0h1v1h-1zM6 0h1v1h-1zM1 1h1v1h-1zM4 1h1v1h-1zM7 1h1v1h-1zM0 2h1v1h-1zM3 2h3v1h-3zM8 2h1v1h-1zM1 3h1v1h-1zM4 3h1v1h-1zM7 3h1v1h-1zM2 4h1v1h-1zM4 4h1v1h-1zM6 4h1v1h-1zM4 5h1v1h-1zM3 6h3v1h-3zM2 7h5v1h-5z",
  star: "M4 0h1v1h-1zM4 1h1v1h-1zM3 2h3v1h-3zM0 3h9v1h-9zM1 4h7v1h-7zM2 5h5v1h-5zM2 6h2v1h-2zM5 6h2v1h-2zM1 7h2v1h-2zM6 7h2v1h-2z",
  trophy: "M0 0h9v1h-9zM0 1h1v1h-1zM2 1h5v1h-5zM8 1h1v1h-1zM0 2h1v1h-1zM2 2h5v1h-5zM8 2h1v1h-1zM1 3h7v1h-7zM2 4h5v1h-5zM4 5h1v1h-1zM4 6h1v1h-1zM2 7h5v1h-5z",
  up: "M4 0h1v1h-1zM3 1h3v1h-3zM2 2h5v1h-5zM1 3h7v1h-7zM3 4h3v1h-3zM3 5h3v1h-3zM3 6h3v1h-3zM3 7h3v1h-3z",
  user: "M3 0h3v1h-3zM2 1h5v1h-5zM2 2h5v1h-5zM3 3h3v1h-3zM1 5h7v1h-7zM0 6h9v1h-9zM0 7h9v1h-9z",
} as const;

export type IconName = keyof typeof ICON_PATHS;

export const ICON_NAMES = Object.keys(ICON_PATHS) as IconName[];
