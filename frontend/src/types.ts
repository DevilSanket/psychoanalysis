/** Shared UI types. */

export interface Meta {
  centerName: string;
  centerId: string;
  reportTitle: string;
  reportDate: string;
  coaches: string[];
  /** Raw report text — fingerprinted server-side to block duplicate saves.
   *  Optional so sessions persisted before this field existed still restore. */
  rawReport?: string;
}
