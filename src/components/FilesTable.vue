<script setup>
import { ref } from 'vue'
import { IconPlayerPauseFilled, IconPlayerPlayFilled, IconLoader2, IconX, IconGripVertical } from '@tabler/icons-vue'

import { appAudioContext, togglePlay, setFirstPlayableFile, onTimeUpdate, onPlay, onPause, onEnd, setMediaSessionHandlers } from '@/audio'
import { levelModel, files, positionsMap, nowPlaying } from '@/store'
import { formatPenalty, formatMS, getGainValue } from '@/helpers'

import Waveform from './Waveform.vue'

async function removeFile(id) {
	let fileToRemove = files.value.find(f => f.id == id)

	if (!fileToRemove) return

	if (nowPlaying.value.id == id) {
		if (nowPlaying.value.state == 'playing') await fileToRemove.audioEl.pause()

		fileToRemove.audioEl.src = ''
		await fileToRemove.audioEl.load()

		Object.assign(nowPlaying.value, {
			id: null,
			state: null
		})
	}

	delete positionsMap.value[id]

	if (fileToRemove.gainNode) fileToRemove.gainNode.disconnect()
	if (fileToRemove.audioSource) fileToRemove.audioSource.disconnect()

	files.value = files.value.filter(f => f.id != id)

	requestAnimationFrame(() => {
		if (!nowPlaying.value.id) setFirstPlayableFile()
		setMediaSessionHandlers()
	})
}

function setAudioRef(file, el) {
	if (file.gainNode) return

	let audioSource = appAudioContext.createMediaElementSource(el)
	let gainNode = appAudioContext.createGain()
	gainNode.gain.value = getGainValue(file)

	audioSource.connect(gainNode).connect(appAudioContext.destination)

	Object.assign(file, {
		audioEl: el,
		audioSource,
		gainNode
	})
}

// drag&drop events
const dragAllowed = ref(false)
const dragIndex = ref(null)
const dragHoverIndex = ref(null)
function onDragStart(e, index, id) {
	if (!dragAllowed.value) return e.preventDefault()
	dragIndex.value = index
}
function onDragEnter(e, index) {
	if (index === dragIndex.value) return
	e.preventDefault()
	dragHoverIndex.value = index
}
function onDragLeave(e, index) {
	if (!e.currentTarget.contains(e.relatedTarget) && index == dragHoverIndex.value) dragHoverIndex.value = null
}
function onDragOver(e, index) {
	if (index != dragIndex.value) e.preventDefault()
}
function onDrop(e, index) {
	files.value.splice(index, 0, files.value.splice(dragIndex.value, 1)[0])
	clearDragVars()
}
function clearDragVars() {
	dragHoverIndex.value = null
	dragIndex.value = null
}

function getColorClass(v) {
	if (v == 0) return 'color-heading'
	else if (v > 0) return 'color-green'
	else if (v < 0) return 'color-red'
}

const levelModels = [{ val: 'spotify', title: 'Spotify' }, { val: 'youtube', title: 'YouTube' }, { val: 'apple', title: 'Apple' }]
</script>

<template>
	<div class="tracks flex line">
		<div class="track-headers light small bold">
			<div></div>
			<div class="xl-hide"></div>
			<div class="track-waveform xl-hide">Waveform</div>
			<div class="track-name">Name</div>
			<div class="track-data flex ta-c">
				<div class="track-level">dBTP</div>
				<div class="track-level clickable" @click="levelModel = 'original'">LUFS</div>
				<div v-for="lm in levelModels" class="track-level clickable" :class="{colHl: levelModel == lm.val}" @click="levelModel = lm.val">{{ lm.title }}</div>
			</div>
			<div></div>
		</div>
		<div
			v-for="(f, index) in files"
			class="track"
			:key="f.id"
			:class="{
				isCurrent: f.id == nowPlaying.id,
				isPlaying: f.id == nowPlaying.id && nowPlaying.state == 'playing',
				rowDrop: dragHoverIndex == index,
				rowDragged: dragIndex == index
			}"
			:draggable="dragAllowed"
			@dragstart="onDragStart($event, index)"
			@dragenter="onDragEnter($event, index)"
			@dragover="onDragOver($event, index)"
			@dragleave="onDragLeave($event, index)"
			@drop="onDrop($event, index)"
			@dragend="clearDragVars"
		>
			<div class="track-grip">
				<span v-if="f.status != 'analyzing'" class="button-grip flex ai-c" @pointerdown="dragAllowed = true" @pointerup="dragAllowed = false" @pointercancel="dragAllowed = false">
					<IconGripVertical />
				</span>
			</div>
			<div class="track-control ta-c">
				<Transition name="fade" mode="out-in">
					<div v-if="f.status == 'analyzing'" class="track-loader-outer">
						<IconLoader2 class="track-loader color-heading" />
					</div>
					<button v-else-if="f.status == 'completed'" class="button-play" @click="togglePlay(f.id)">
						<IconPlayerPauseFilled v-if="nowPlaying.id == f.id && nowPlaying.state == 'playing'" />
						<IconPlayerPlayFilled v-else />
					</button>
				</Transition>
				<audio v-if="f.status == 'completed'" class="invisible" :data-id="f.id" :ref="(e) => setAudioRef(f, e)" preload :src="f.audioSrc" @timeupdate="onTimeUpdate" @play="onPlay" @pause="onPause" @ended="onEnd"></audio>
			</div>
			<div class="track-waveform">
				<Transition name="fade">
					<Waveform v-if="f.waveform?.length" :file="f" />
				</Transition>
			</div>
			<div class="track-name track-name-text" draggable="false">
				{{ f.name }}
			</div>
			<Transition name="fade" mode="out-in">
				<div v-if="f.status == 'analyzing'" class="track-message color-blue fw600">Analyzing...</div>
				<div v-else-if="f.status == 'error'" class="track-message color-red fw600">{{ f.error }}</div>
				<div v-else class="track-data ta-c flex">
					<div class="track-level fw600 color-heading" data-title="dBTP">{{ formatPenalty(f.truePeak) }}</div>
					<div class="track-level fw600 color-heading clickable" data-title="LUFS" @click="levelModel = 'original'">{{ formatPenalty(f.lufs) }}</div>
					<div v-for="lm in levelModels" class="track-level fw600 clickable" :data-title="lm.title" :class="[getColorClass(f[lm.val]), { colHl: levelModel == lm.val }]" @click="levelModel = lm.val">{{ formatPenalty(f[lm.val]) }}</div>
				</div>
			</Transition>
			<div v-if="f.status != 'analyzing'" class="track-remove">
				<button @click.prevent="removeFile(f.id)" class="button-x"><IconX /></button>
			</div>
		</div>
	</div>
</template>