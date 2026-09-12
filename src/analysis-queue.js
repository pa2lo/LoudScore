export const abortError = () => new DOMException('Analysis cancelled', 'AbortError')
// Cap simultaneous decoded buffers at four to bound memory on high-core hosts.
export function concurrencyLimit(cores = globalThis.navigator?.hardwareConcurrency) {
	return Number.isFinite(cores) && cores > 0 ? Math.max(1, Math.floor(cores) - 1)	: 2
}

// The task owns its slot until it settles, even when an uninterruptible read or
// decode has been cancelled. Queued tasks can be removed immediately.
export function createQueue(limit = concurrencyLimit()) {
	let active = 0
	const waiting = []
	function drain() {
		while (active < limit && waiting.length) {
			const job = waiting.shift()
			job.signal?.removeEventListener('abort', job.cancel)
			active++
			Promise.resolve().then(() => {
				job.signal?.throwIfAborted()
				return job.run()
			}).then(job.resolve, job.reject).finally(() => {
				active--
				drain()
			})
		}
	}
	return (run, signal) => new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(abortError())
		const job = { run, signal, resolve, reject, cancel: () => {
			const index = waiting.indexOf(job)
			if (index >= 0) waiting.splice(index, 1)
			signal.removeEventListener('abort', job.cancel)
			reject(abortError())
		} }
		waiting.push(job)
		signal?.addEventListener('abort', job.cancel, { once: true })
		drain()
	})
}
export const enqueueAnalysis = createQueue()

// A subscriber never owns another subscriber's cancellation. Keep an aborted
// entry until settlement so a new subscriber cannot overlap an old decode.
export function createSharedAnalysis() {
	const pending = new Map()
	return async function shared(id, run, signal, onProgress) {
		signal.throwIfAborted()
		let entry = pending.get(id)
		if (entry?.controller.signal.aborted) {
			try { await entry.promise } catch { /* retry after cleanup */ }
			return shared(id, run, signal, onProgress)
		}
		if (!entry) {
			entry = { controller: new AbortController(), subscribers: new Set(), progress: null }
			pending.set(id, entry)
			entry.promise = Promise.resolve().then(() => run(entry.controller.signal, progress => {
				entry.progress = progress
				for (const subscriber of entry.subscribers) subscriber(progress)
			})).finally(() => { if (pending.get(id) === entry) pending.delete(id) })
		}
		const listener = progress => { if (!signal.aborted) onProgress?.(progress) }
		entry.subscribers.add(listener)
		if (entry.progress) listener(entry.progress)
		const cancel = () => {
			entry.subscribers.delete(listener)
			if (!entry.subscribers.size) entry.controller.abort()
		}
		signal.addEventListener('abort', cancel, { once: true })
		try {
			const result = await entry.promise
			signal.throwIfAborted()
			return result
		} finally {
			signal.removeEventListener('abort', cancel)
			entry.subscribers.delete(listener)
		}
	}
}