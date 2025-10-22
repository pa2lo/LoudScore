<script setup>
import { analyzing, files, nowPlaying, positionsMap } from '@/store'
import { IconUpload } from '@tabler/icons-vue'
import { setFirstPlayableFile, setMediaSessionHandlers } from '@/audio'

const props = defineProps({
	large: Boolean
})

async function handleFileChange(e) {
	if (!e.target?.files) return

	const inputFiles = Array.from(e.target.files)
	analyzing.value = true

	console.time('ProcessTime')

	await Promise.all(inputFiles.map(async f => {
		const newID = crypto.randomUUID()

		files.value.push({
			id: newID,
			name: f.name.replace(/\.[^/.]+$/, ''),
			status: 'analyzing',
			duration: 0,
			size: '-',
			lufs: '-',
			truePeak: '-',
			spotify: '-',
			youtube: '-',
			apple: '-',
			waveform: [],
			audioSrc: URL.createObjectURL(f),
			audioEl: null,
			audioSource: null,
			gainNode: null
		})
		positionsMap.value[newID] = 0

		try {
			const result = await analyzeFile(f)
			Object.assign(files.value.find(item => item.id == newID), result)
		} catch (err) {
			console.error('Error analyzing file:', err);
			Object.assign(files.value.find(item => item.id == newID), {
				error: err.message || 'Unknown error during analysis',
				status: 'error'
			})
		}
	}))

	analyzing.value = false
	console.timeEnd('ProcessTime')

	if (!nowPlaying.value.id) setFirstPlayableFile()

	setMediaSessionHandlers()
}

async function analyzeFile(file) {
	const worker = new Worker('worker.js')
	const audioContext = new AudioContext()

	try {
		let audioBuffer
		try {
			const arrayBuffer = await file.arrayBuffer()
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
		await audioContext.close()
	}
}
</script>

<template>
	<label v-if="large" class="ta-c files-label">
		<IconUpload class="files-label-ico" />
		<p class="mt05 bigger color-heading"><strong>Click to select</strong> or drag and drop files here</p>
		<p class="mt025 small light">MP3, WAV, OGG, M4A, FLAC (multiple files supported)</p>
		<input type="file" class="invisible" multiple accept="audio/*" @change="handleFileChange" :disabled="analyzing" />
	</label>
	<label v-else class="button bttn-file-input" :class="{disabled: analyzing}">
		<input type="file" class="invisible" multiple accept="audio/*" @change="handleFileChange" :disabled="analyzing" />
		<span>Add files</span>
	</label>
</template>