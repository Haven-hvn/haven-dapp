/**
 * Combine user abort with optional download timeout.
 *
 * @module lib/abort-signal
 */

/**
 * AbortSignal that fires when `parent` aborts or after `timeoutMs` elapses.
 */
export function linkAbortSignal(
  parent: AbortSignal | undefined,
  timeoutMs: number | undefined
): AbortSignal {
  const controller = new AbortController()

  const abort = (reason?: unknown) => {
    if (!controller.signal.aborted) {
      controller.abort(reason)
    }
  }

  const onParentAbort = () => abort(parent?.reason)

  if (parent != null) {
    if (parent.aborted) {
      abort(parent.reason)
      return controller.signal
    }
    parent.addEventListener('abort', onParentAbort, { once: true })
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  if (timeoutMs != null && timeoutMs > 0) {
    timer = setTimeout(
      () => abort(new DOMException('Download timed out', 'TimeoutError')),
      timeoutMs
    )
  }

  controller.signal.addEventListener(
    'abort',
    () => {
      parent?.removeEventListener('abort', onParentAbort)
      if (timer != null) {
        clearTimeout(timer)
      }
    },
    { once: true }
  )

  return controller.signal
}
