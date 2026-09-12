export async function analyzeFile(file, bytes, { signal = new AbortController().signal, onProgress = () => {} } = {}) {
	let worker, audioContext, closing, rejectWorker
	const close = () => {
		if (audioContext && !closing) closing = Promise.resolve(audioContext.close()).catch(() => {})
		return closing
	}
	const cancel = () => {
		worker?.terminate()
		void close()
		rejectWorker?.(signal.reason)
	}
	signal.throwIfAborted()
	signal.addEventListener('abort', cancel, { once: true })
	try {
		onProgress({ status: 'decoding', progress: null })
		audioContext = new AudioContext()
		const arrayBuffer = bytes || await file.arrayBuffer()
		signal.throwIfAborted()
		let audioBuffer
		try {
			// decodeAudioData can detach its input; retain bytes for cache retries.
			audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0))
		} catch (error) {
			signal.throwIfAborted()
			throw new Error(`Audio decoding failed: ${error?.message || error}`)
		}
		signal.throwIfAborted()
		await close()
		signal.throwIfAborted()
		const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, i) => audioBuffer.getChannelData(i).slice())
		const sampleRate = audioBuffer.sampleRate
		const duration = Math.round(audioBuffer.duration)
		worker = new Worker('worker.js')
		onProgress({ status: 'analyzing', progress: 0 })
		return await new Promise((resolve, reject) => {
			rejectWorker = reject
			worker.onmessage = ({ data }) => {
				if (signal.aborted) return
				if (data?.type === 'progress') {
					onProgress({ status: 'analyzing', progress: Math.max(0, Math.min(99, data.progress)) })
					return
				}
				if (data?.error) return reject(new Error(data.error))
				if (data?.type !== 'result') return
				try {
					resolve({
						size: (file.size / 1024 / 1024).toFixed(2), duration,
						...Object.fromEntries(['lufs', 'truePeak', 'spotify', 'youtube', 'apple'].map(key => [key, data[key].toFixed(1)])),
						status: 'completed', progress: 100, waveform: data.waveform, sampleRate
					})
				} catch (error) { reject(error) }
			}
			worker.onerror = error => reject(new Error(`Worker crashed: ${error?.message || error}`))
			worker.onmessageerror = () => reject(new Error('Unable to read worker result'))
			worker.postMessage({ channels, sampleRate }, channels.map(ch => ch.buffer))
		})
	} finally {
		signal.removeEventListener('abort', cancel)
		if (worker) {
			worker.onmessage = worker.onerror = worker.onmessageerror = null
			worker.terminate()
		}
		await close()
	}
}
