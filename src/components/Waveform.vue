<script setup>
import { ref } from 'vue'
import { positionsMap } from '@/store'
import { maxDuration, seekToTime } from '@/audio'
import { formatMS } from '@/helpers'

const props = defineProps({
	file: Object
})

const ttipCoords = ref({
	index: 0,
	offX: 0,
	time: '0:00',
	cv: 0
})
function onMouseMove(e) {
	let i = e.target.dataset?.index
	if (ttipCoords.value.index == i && i !== undefined) return

	Object.assign(ttipCoords.value, {
		index: i,
		offX: `${i / props.file.duration * 100}%`,
		time: formatMS(i),
		cv: `${e.target.clientWidth/2}px`
	})
}
</script>

<template>
	<div class="wf-outer" :style="{'--w': `${file.duration / maxDuration * 100}%`}" @mousemove.capture="onMouseMove">
		<div
			v-for="(wf, s) in file.waveform"
			class="wf"
			:style="{
				'--h': `${wf}%`
			}"
			:class="{
				played: positionsMap[file.id] > s
			}"
			@click="seekToTime(file.id, s)"
			:data-index="s"
		></div>
		<div class="wf-time" :style="{'--offX': ttipCoords.offX, '--cv': ttipCoords.cv}">{{ ttipCoords.time }}</div>
	</div>
</template>