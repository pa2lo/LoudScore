export async function analyzeFile(file, bytes) {
	const worker = new Worker('worker.js')
	const audioContext = new AudioContext()

	try {
		let audioBuffer
		try {
			const arrayBuffer = bytes || await file.arrayBuffer()
			audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
		} catch (err) {
			throw new Error(`Audio decoding failed: ${err?.message || err}`)
		}

		const channels = []
		for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
			channels.push(audioBuffer.getChannelData(i).slice())
		}

		const sampleRate = audioBuffer.sampleRate
		const duration = Math.round(audioBuffer.duration)
		const transferList = channels.map(ch => ch.buffer)

		return await new Promise((resolve, reject) => {
			worker.onmessage = (e) => {
				const data = e.data

				if (data?.error) {
					reject(new Error(data.error))
					return
				}

				worker.terminate()

				resolve({
					size: (file.size / 1024 / 1024).toFixed(2),
					duration,
					lufs: data.lufs.toFixed(1),
					truePeak: data.truePeak.toFixed(1),
					spotify: data.spotify.toFixed(1),
					youtube: data.youtube.toFixed(1),
					apple: data.apple.toFixed(1),
					status: 'completed',
					waveform: data.waveform,
					sampleRate
				})
			}

			worker.onerror = (err) => {
				reject(new Error(`Worker crashed: ${err?.message || err}`))
				worker.terminate()
			}

			worker.postMessage({ channels, sampleRate }, transferList)
		})
	} finally {
		worker.terminate()
		await audioContext.close()
	}
}

