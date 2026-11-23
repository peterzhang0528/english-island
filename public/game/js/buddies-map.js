// Buddy Island layout. Pure data shared by the director (game rules) and the Three.js world.
export const ISLAND_RADIUS = 26;
export const PLAYER_SPEED = 6.4;
export const SPAWN = Object.freeze({ player: { x: 0, z: 20 }, mia: { x: -1.6, z: 2 }, leo: { x: 1.6, z: 3 } });
// word is the full name, quiz the one-word answer, say every form that counts when spoken.
// x/z is where you stand to "be at" the place; r is how close counts as arriving.
export const PLACES = Object.freeze({
  tree: { id: 'tree', word: 'apple tree', quiz: 'tree', say: ['apple tree', 'tree'], x: -11, z: -5, r: 4 },
  boat: { id: 'boat', word: 'boat', quiz: 'boat', say: ['boat'], x: 21, z: 8, r: 4.5 },
  bridge: { id: 'bridge', word: 'bridge', quiz: 'bridge', say: ['bridge'], x: 2, z: -15, r: 4 },
  lighthouse: { id: 'lighthouse', word: 'lighthouse', quiz: 'lighthouse', say: ['lighthouse', 'light house'], x: -15, z: -15, r: 4.5 },
  sheep: { id: 'sheep', word: 'sheep', quiz: 'sheep', plural: true, say: ['sheep'], x: 12, z: -6, r: 4 },
  flowers: { id: 'flowers', word: 'flowers', quiz: 'flowers', plural: true, say: ['flowers', 'flower'], x: -8, z: 10, r: 4 },
  rock: { id: 'rock', word: 'big rock', quiz: 'rock', say: ['big rock', 'rock'], x: 10, z: 15, r: 4 },
  chest: { id: 'chest', word: 'treasure chest', quiz: 'chest', say: ['treasure chest', 'chest', 'treasure'], x: -19, z: 4, r: 4 },
});
export const PLACE_IDS = Object.freeze(Object.keys(PLACES));
export const HIDING_PLACES = Object.freeze(['tree', 'rock', 'lighthouse', 'sheep', 'chest']);

export function distance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

/** Keeps a point on the walkable disc, a little inside the shoreline. */
export function clampToIsland(point, margin = 1.2) {
  const limit = ISLAND_RADIUS - margin, length = Math.hypot(point.x, point.z);
  return length <= limit ? { x: point.x, z: point.z } : { x: point.x / length * limit, z: point.z / length * limit };
}
