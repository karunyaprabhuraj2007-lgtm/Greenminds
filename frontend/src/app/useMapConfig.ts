import type { MapConfig } from "./types";
import { useApi } from "./useApi";

export const useMapConfig = () => useApi<MapConfig>("/api/map/config");
