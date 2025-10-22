<script setup>
import { ref, watch, onBeforeUnmount, onMounted, computed, onBeforeMount } from 'vue'
import { IconPlayerPlayFilled, IconPlayerPauseFilled, IconDeviceSpeaker, IconDeviceSpeakerFilled, IconBrandSpotify, IconBrandSpotifyFilled, IconBrandYoutube, IconBrandYoutubeFilled, IconBrandApple, IconBrandAppleFilled, IconX, IconSettings, IconPlayerTrackPrevFilled, IconPlayerTrackNextFilled, IconRewindForward5, IconRewindBackward5, IconRewindForward10, IconRewindBackward10, IconRewindForward15, IconRewindBackward15, IconArrowUp, IconArrowDown, IconArrowLeft, IconArrowRight, IconChevronDown } from '@tabler/icons-vue'

import { useRegisterSW } from 'virtual:pwa-register/vue'

import { levelModel, files, nowPlaying, colorTheme, switchTrackMode, waveformDisplay, seekTime } from './store'
import { getGainValue } from './helpers'
import { appAudioContext, isFirstPlayableTrack, isLastPlayableTrack, seekFW, seekRW, playNext, playPrev, togglePlay } from './audio'

import SettingsRow from './components/SettingsRow.vue'
import FilesInput from './components/FilesInput.vue'
import FilesTable from './components/FilesTable.vue'

// UI
let settingsEl = ref(null)

// file handlers
watch(levelModel, newVal => {
	files.value.forEach(f => {
		if (!f.gainNode) return

		requestAnimationFrame(() => {
			f.gainNode.gain.value = getGainValue(f)
		})
	})
})
watch(colorTheme, newVal => {
	document.documentElement.classList.toggle('theme-dark', newVal == 'dark')
	document.documentElement.classList.toggle('theme-light', newVal == 'light')

	document.querySelector('meta[name="theme-color"]').setAttribute('content', newVal == 'dark' || (!newVal && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#111111' : '#f8f8f8')
})

/* lifecycle */
onBeforeMount(() =>{
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault()
		installPrompt.value = e
	})
})
onMounted(() => {
	document.addEventListener('keydown', handleGlobalKeypress)
})
onBeforeUnmount(async () => {
	document.removeEventListener('keydown', handleGlobalKeypress)

	files.value.forEach(f => {
		if (f.gainNode) f.gainNode.disconnect()
		if (f.audioSource) f.audioSource.disconnect()
	})
	await appAudioContext.close()
})

/* app events */
function handleGlobalKeypress(e) {
	if (!files.value.length || document.querySelector('dialog[open]')) return

	if (e.code == 'Space' && nowPlaying.value.id && !document.activeElement.matches('button')) togglePlay(nowPlaying.value.id)
	if (e.code == 'ArrowRight') seekFW()
	if (e.code == 'ArrowLeft') seekRW()
	if (['ArrowUp', 'KeyP'].includes(e.code)) playPrev()
	if (['ArrowDown', 'KeyN'].includes(e.code)) playNext()
	if (e.code == 'KeyO') levelModel.value = 'original'
	if (e.code == 'KeyS') levelModel.value = 'spotify'
	if (e.code == 'KeyY') levelModel.value = 'youtube'
	if (e.code == 'KeyA') levelModel.value = 'apple'
}

/* settings options */
const waveformDisplayOptions = [{ value: 'real', title: 'Real' }, { value: 'stretch', title: 'Stretch' }]
const colorThemeOptions = [{ value: '', title: 'Auto' }, { value: 'dark', title: 'Dark' }, { value: 'light', title: 'Light' }]
const switchTrackModeOptions = [{ value: '', title: 'Resume' }, { value: 'relative', title: 'Relative' }, { value: 'absolute', title: 'Absolute' }]
const seekTimeOptions = [{ value: 5, title: '5s' }, { value: 10, title: '10s' }, { value: 15, title: '15s' }]
const levelModels = [
	{ value: 'original', title: 'Original', icon: IconDeviceSpeaker, iconActive: IconDeviceSpeakerFilled },
	{ value: 'spotify', title: 'Spotify', icon: IconBrandSpotify, iconActive: IconBrandSpotifyFilled },
	{ value: 'youtube', title: 'YouTube', icon: IconBrandYoutube, iconActive: IconBrandYoutubeFilled },
	{ value: 'apple', title: 'Apple', icon: IconBrandApple, iconActive: IconBrandAppleFilled }
]
const currentLevelModel = computed(() => {
	return levelModels.find(lm => lm.value == levelModel.value)
})

const seekTimeMap = {
	5: { fw: IconRewindForward5, bw: IconRewindBackward5 },
	10: { fw: IconRewindForward10, bw: IconRewindBackward10 },
	15: { fw: IconRewindForward15, bw: IconRewindBackward15 }
}

/* PWA */
const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW()
let installPromptClosed = ref(localStorage.getItem('installClosed'))
let installPrompt = ref(null)
function closeInstall() {
	installPromptClosed.value = 1
	localStorage.setItem('installClosed', 1)
}
function installApp() {
	if (!installPrompt.value) return

	installPrompt.value.prompt()
	installPrompt.value.userChoice.then(result => {
		if (result.outcome === 'accepted') installPrompt.value = null
	})
}
</script>

<template>
	<div class="app-cont">
		<header class="header flex ai-c">
			<a href="/" class="logo">
				<img class="logo-svg h-dark" src="/logo.svg" alt="" />
				<img class="logo-svg h-light" src="/logo-light.svg" alt="" />
				<span class="logo-text">LoudScore</span>
			</a>
			<TransitionGroup name="fade">
				<div v-if="files.length" class="control-buttons flex ai-c">
					<button class="control-button" :disabled="isFirstPlayableTrack" @click="playPrev"><IconPlayerTrackPrevFilled /></button>
					<button class="control-button" :disabled="!nowPlaying.id" @click="seekRW"><component :is="seekTimeMap[seekTime].bw" /></button>
					<button class="button-play control-play" :disabled="!nowPlaying.id" @click="togglePlay(nowPlaying.id)">
						<IconPlayerPauseFilled v-if="nowPlaying.state == 'playing'" />
						<IconPlayerPlayFilled v-else />
					</button>
					<button class="control-button" :disabled="!nowPlaying.id" @click="seekFW"><component :is="seekTimeMap[seekTime].fw" /></button>
					<button class="control-button" :disabled="isLastPlayableTrack" @click="playNext"><IconPlayerTrackNextFilled /></button>
				</div>
				<div v-if="files.length" class="levelmodels-outer">
					<button class="levelmodel-toggle button button-light" popovertarget="lovelModelPopover">
						<component :is="currentLevelModel.iconActive" class="levelmodel-ico" />
						<span class="levelmodel-toggle-title">{{ currentLevelModel.title }}</span>
						<IconChevronDown class="levelmodel-toggle-arrow" />
					</button>
					<div id="lovelModelPopover" class="levelmodels-popover-cont" popover>
						<button v-for="lm in levelModels" class="levelmodel-button" :class="{isActive: levelModel == lm.value}" popovertarget="lovelModelPopover" popovertargetaction="hide" @click="levelModel = lm.value">
							<component :is="levelModel == lm.value ? lm.iconActive : lm.icon" class="levelmodel-ico" />
							<span class="levelmodel-button-text">{{ lm.title }}</span>
						</button>
					</div>
					<div class="levelmodels xl-hide">
						<label v-for="lm in levelModels" class="levelmodel">
							<input type="radio" class="levelmodel-input" name="levelmodel" :value="lm.value" v-model="levelModel" />
							<component :is="levelModel == lm.value ? lm.iconActive : lm.icon" class="levelmodel-ico" />
							<span class="levelModel-title xl-hide">{{ lm.title }}</span>
						</label>
					</div>
				</div>
			</TransitionGroup>
			<button class="button button-light button-narrower" @click="settingsEl.showModal()">
				<IconSettings class="button-ico" />
				<span class="m-hide">Settings</span>
			</button>
		</header>
		<Transition name="fade" mode="out-in">
			<FilesInput v-if="!files.length" large />
			<div v-else :class="{waveformStretch: waveformDisplay == 'stretch'}">
				<FilesTable />
				<div class="line buttons flex ai-c">
					<FilesInput />
					<button v-if="installPrompt && installPromptClosed" class="button button-light" @click="installApp()"><span>Download App</span></button>
				</div>
			</div>
		</Transition>

		<div v-if="needRefresh" class="line app-note ta-c">
			<h3 class="app-note-title">New content available, click on reload button to update.</h3>
			<p>
				<button @click="updateServiceWorker()" class="button">Download</button>  <button @click="needRefresh = false" class="button button-light">Close</button>
			</p>
		</div>

		<div v-if="installPrompt && !installPromptClosed" class="line app-note ta-c">
			<h3 class="app-note-title">Download LoudScore as a Web App to your PC and use it anytime, even offline.</h3>
			<p>
				<button @click="installApp()" class="button">Download</button>  <button @click="closeInstall()" class="button button-light">Close</button>
			</p>
		</div>

		<div class="line small ta-c">
			<div>Your files never leave your device. All processing happens entirely in your browser.</div>
			<div>App is optimized for Chrome and Chromium based browsers (Opera, Brave...)</div>
		</div>

		<dialog ref="settingsEl" closedby="any" class="dialog">
			<div class="modal-title flex ai-c">
				<span class="color-heading">Settings</span>
				<button class="modal-x" @click="settingsEl.close()"><IconX /></button>
			</div>
			<SettingsRow label="Waveform length" :options="waveformDisplayOptions" v-model="waveformDisplay" name="waveformDisplay" />
			<SettingsRow label="Color theme" :options="colorThemeOptions" v-model="colorTheme" name="colorTheme" />
			<SettingsRow label="Seek time" :options="seekTimeOptions" v-model="seekTime" name="seekTime" />
			<SettingsRow label="Switch track mode" :options="switchTrackModeOptions" v-model="switchTrackMode" name="switchTrackMode">
				<p v-if="switchTrackMode == ''"><strong class="fw600">Resume</strong> - Each track remembers its own position. When you switch back to a track, it continues from where it was last played.</p>
				<p v-else-if="switchTrackMode == 'relative'"><strong class="fw600">Relative</strong> - The new track starts at the same relative position as the previous one (e.g., if the last track was 37% played, the new one starts at 37% of its length).</p>
				<p v-else-if="switchTrackMode == 'absolute'"><strong class="fw600">Absolute</strong> - The new track starts at the same timestamp as the previous one (e.g., 3:05).</p>
			</SettingsRow>
			<div class="setting divided touch-hide">
				<div class="setting-title">Keyboard shortcuts</div>
				<div class="hotkey"><strong>space</strong><span>toggle play / pause</span></div>
				<div class="hotkey"><strong><IconArrowLeft /></strong><strong><IconArrowRight /></strong><span>seek backward | forward</span></div>
				<div class="hotkey"><strong><IconArrowUp /></strong><strong><IconArrowDown /></strong><span>previous | next track</span></div>
				<div class="hotkey"><strong>o</strong><span>original volume</span></div>
				<div class="hotkey"><strong>s</strong><span>match Spotify</span></div>
				<div class="hotkey"><strong>y</strong><span>match YouTube</span></div>
				<div class="hotkey"><strong>a</strong><span>match Apple Music</span></div>
			</div>
		</dialog>
	</div>
</template>