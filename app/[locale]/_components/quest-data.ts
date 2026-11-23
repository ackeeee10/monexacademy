// Geometry for the hero "quest map": a trail winding up to a summit, milestones
// along the way, and topographic contour lines. viewBox is 0 0 1440 900.

/** The trail, bottom-left to the summit at top-right. */
export const TRAIL =
  "M 470 860 C 560 800, 640 820, 700 760 S 780 640, 870 640 S 1010 600, 1030 520 S 1000 410, 1090 380 S 1230 330, 1250 250 S 1240 180, 1300 160";

/** Milestones on the trail (the last one is the summit). */
export const MILESTONES = [
  { x: 700, y: 760 },
  { x: 870, y: 640 },
  { x: 1030, y: 520 },
  { x: 1090, y: 380 },
  { x: 1300, y: 160 },
] as const;

/** Contour lines around the summit, widest first. */
export const CONTOURS = [
  "M 760 900 C 760 660, 980 420, 1180 300 C 1340 205, 1480 180, 1500 120",
  "M 860 900 C 870 700, 1040 480, 1220 360 C 1360 270, 1480 250, 1500 210",
  "M 980 900 C 990 740, 1120 560, 1270 450 C 1380 370, 1470 350, 1500 320",
  "M 1100 900 C 1110 780, 1210 640, 1330 560 C 1410 505, 1470 490, 1500 470",
  "M 1180 120 C 1230 80, 1340 70, 1400 110 C 1440 140, 1420 200, 1360 220 C 1290 240, 1210 220, 1190 180 C 1180 160, 1175 135, 1180 120 Z",
  "M 1235 135 C 1265 112, 1330 108, 1362 132 C 1384 150, 1372 182, 1338 192 C 1300 202, 1258 192, 1244 170 C 1236 158, 1232 145, 1235 135 Z",
] as const;
