// Writes the one-line runtime trap report (RFC 0004 section 5): `trap: <kind>` and one LF,
// to standard error. A trap is not a diagnostic, so there is no code and no span.
// The caller chooses the kind string and the exit status; this function does not.

export interface TrapSink {
  write(chunk: string): unknown;
}

// Writes `trap: <kind>` and one LF in a single write call. A kind containing CR or LF would
// make the report more than one line, so it is refused before anything is written.
export function writeTrap(kind: string, sink: TrapSink = process.stderr): void {
  if (/[\r\n]/.test(kind)) {
    throw new RangeError('trap kind must not contain CR or LF');
  }
  sink.write(`trap: ${kind}\n`);
}
