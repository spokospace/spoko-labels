/**
 * A byte pipe to one printer. Implementations own the link details (chunking, MTU, reconnects);
 * the `Printer` only writes whole packets and reads the notification stream.
 */
export interface Transport {
  readonly connected: boolean;
  /** Write one whole packet. The transport may split it on the wire. */
  write(packet: Uint8Array): Promise<void>;
  /** Subscribe to raw notification bytes. Returns an unsubscribe function. */
  onData(listener: (bytes: Uint8Array) => void): () => void;
  /** Subscribe to link loss. Returns an unsubscribe function. */
  onDisconnect(listener: () => void): () => void;
  close(): Promise<void>;
}
