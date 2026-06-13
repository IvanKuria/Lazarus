export { computeCid } from "./cid.js";
export { normalizeUrl } from "./url.js";
export { simhash, hammingDistance } from "./fingerprint.js";
export { shouldCapture } from "./privacy.js";
export {
  buildObservation,
  classifyChange,
  EDIT_DISTANCE_MAX,
} from "./observation.js";
export { recordCapture } from "./record.js";
export { MemoryObservationStore } from "./store.js";
export { IdbObservationStore } from "./idb-store.js";
export type { ObservationStore, RecordResult } from "./store.js";
export type {
  Observation,
  CapturedPage,
  ChangeKind,
} from "./types.js";
