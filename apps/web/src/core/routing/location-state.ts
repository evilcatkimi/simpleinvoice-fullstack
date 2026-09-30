/**
 * Reads one field of router state (`location.state`). That state is untyped and outlives the code
 * that wrote it: browsers keep it in `history.state` across reloads, so an older version of the
 * app may have written it. Callers validate the value before using it.
 */
export function readLocationState(locationState: unknown, field: string): unknown {
  return typeof locationState === 'object' &&
    locationState !== null &&
    Object.hasOwn(locationState, field)
    ? (locationState as Record<string, unknown>)[field]
    : undefined;
}
