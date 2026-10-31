/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the API, for example https://api.example.com. Empty means same origin (/api). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** US state outlines (TopoJSON) for the Overview airport map. */
declare module 'us-atlas/states-10m.json' {
  import type { GeometryCollection, Topology } from 'topojson-specification';
  const topology: Topology<{ states: GeometryCollection<{ name: string }>; nation: GeometryCollection }>;
  export default topology;
}
