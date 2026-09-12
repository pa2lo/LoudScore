<script setup>
import { analyzing } from '@/store'
import { IconUpload } from '@tabler/icons-vue'
import { supportsSessions, busy, addFiles, pickFiles, inputError } from '@/sessions'
import { ref } from 'vue'

defineProps({
	large: Boolean
})

const input = ref(null)

function selectFiles() {
	if (busy.value || analyzing.value) return
	if (supportsSessions) pickFiles()
	else input.value.click()
}

function changed(event) {
	addFiles(Array.from(event.target.files || []).map(file => ({ file })))
	event.target.value = ''
}

async function dropped(event) {
	if (busy.value || analyzing.value) return
	// Request handles before yielding; the drag data store is only available during the event.
	const pending = Array.from(event.dataTransfer.items).filter(item => item.kind === 'file').map(item => {
		const file = item.getAsFile()
		const handle = supportsSessions && item.getAsFileSystemHandle ? item.getAsFileSystemHandle() : Promise.resolve(null)
		return handle.then(handle => ({ file, handle }), () => ({ file, handle: null }))
	})
	try {
		await addFiles((await Promise.all(pending)).filter(({ file, handle }) => file && handle?.kind !== 'directory' && (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac|aiff|opus|webm)$/i.test(file.name))))
	} catch (error) {
		inputError.value = error.message
	}
}
</script>
<template>
	<div @dragover.prevent @drop.prevent.stop="dropped">
		<input ref="input" type="file" class="invisible" tabindex="-1" multiple accept="audio/*" @change="changed" :disabled="busy || analyzing" />
		<button v-if="large" type="button" class="ta-c files-label" :disabled="busy || analyzing" @click="selectFiles">
			<IconUpload class="files-label-ico" />
			<span class="files-label-text mt05 bigger color-heading"><strong>Click to select</strong> or drag and drop files here</span>
			<span class="files-label-text mt025 small light">MP3, WAV, OGG, M4A, FLAC (multiple files supported)</span>
		</button>
		<button v-else type="button" class="button bttn-file-input" :disabled="busy || analyzing" @click="selectFiles">
			<span>Add files</span>
		</button>
	</div>
</template>
