import {
  collection,
  doc,
  DocumentData,
  DocumentReference,
  Firestore,
  writeBatch,
} from '@angular/fire/firestore';

/** Fired on window when a background write is rejected; ToastService shows it. */
export const WRITE_FAILED_EVENT = 'app-write-failed';

/**
 * Start a Firestore write without waiting for the server.
 *
 * With the persistent cache on, Firestore applies a write on the device at once
 * and uploads it when it can - but the promise only settles when the server
 * answers, so awaiting it offline hangs the screen. Call this instead of
 * `await`, carry on, and let the top bar's sync pill show when it uploads.
 * A rejection (e.g. permission denied) is logged and raised as a toast.
 */
export function writeInBackground(write: Promise<unknown>): void {
  write.catch((err) => {
    console.error('Firestore write failed', err);
    window.dispatchEvent(new CustomEvent(WRITE_FAILED_EVENT, { detail: err }));
  });
}

/**
 * Archive entries into `logs` and delete the record, as one all-or-nothing batch.
 * (Awaiting each write used to guarantee "no delete without its archive";
 * the batch keeps that guarantee without waiting, and queues offline.)
 */
export function archiveAndDelete(
  firestore: Firestore,
  target: DocumentReference,
  ...logEntries: DocumentData[]
): void {
  const batch = writeBatch(firestore);
  for (const entry of logEntries) {
    batch.set(doc(collection(firestore, 'logs')), entry);
  }
  batch.delete(target);
  writeInBackground(batch.commit());
}
