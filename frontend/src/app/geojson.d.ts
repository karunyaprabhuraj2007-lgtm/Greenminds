// Minimal GeoJSON typings (avoids an extra dependency).
declare namespace GeoJSON {
  type Position = number[];
  interface Polygon { type: "Polygon"; coordinates: Position[][] }
  interface MultiPolygon { type: "MultiPolygon"; coordinates: Position[][][] }
  interface Point { type: "Point"; coordinates: Position }
  interface LineString { type: "LineString"; coordinates: Position[] }
  type Geometry = Polygon | MultiPolygon | Point | LineString;
}
