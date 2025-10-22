import { computed } from "vue"
import { files, nowPlaying, positionsMap, switchTrackMode, seekTime } from "./store"

export const appAudioContext = new AudioContext()

const playableIDs = computed(() => files.value.filter(f => f.status == 'completed').map(f => f.id))
const currentPlayingFile = computed(() => files.value.find(f => f.id == nowPlaying.value.id))
export const isLastPlayableTrack = computed(() => !nowPlaying.value.id || nowPlaying.value.id == playableIDs.value[playableIDs.value.length - 1])
export const isFirstPlayableTrack = computed(() => !nowPlaying.value.id || nowPlaying.value.id == playableIDs.value[0])
export const maxDuration = computed(() => {
	if (!files.value.length) return 0
	return files.value.reduce((acc, f) => f.duration > acc ? f.duration : acc, 0)
})

export function seekFW() {
	if (!currentPlayingFile.value) return
	currentPlayingFile.value.audioEl.currentTime += +seekTime.value
}
export function seekRW() {
	if (!currentPlayingFile.value) return
	currentPlayingFile.value.audioEl.currentTime -= +seekTime.value
}
export function playNext() {
	if (isLastPlayableTrack.value) return

	togglePlay(playableIDs.value[playableIDs.value.findIndex(id => id == nowPlaying.value.id) + 1])
}
export function playPrev() {
	if (isFirstPlayableTrack.value) return

	togglePlay(playableIDs.value[playableIDs.value.findIndex(id => id == nowPlaying.value.id) - 1])
}
export async function togglePlay(id) {
	if (appAudioContext.state == 'suspended') await appAudioContext.resume()

	const newFile = files.value.find(f => f.id == id)
	const currentFile = files.value.find(f => f.id == nowPlaying.value.id)

	if (nowPlaying.value.id && nowPlaying.value.id != id) {
		if (nowPlaying.value.state == 'playing') currentFile.audioEl.pause()
		if (switchTrackMode.value == 'absolute' && currentFile.audioEl.currentTime < newFile.duration) newFile.audioEl.currentTime = currentFile.audioEl.currentTime
		else if (switchTrackMode.value == 'relative' ) {
			const relPosition = currentFile.audioEl.currentTime / currentFile.duration
			const newTime = newFile.duration * relPosition
			newFile.audioEl.currentTime = newTime
		}
	} else if (nowPlaying.value.id == id && nowPlaying.value.state == 'playing') return newFile.audioEl.pause()
	newFile.audioEl.play()
}
export async function seekToTime(id, time) {
	if (appAudioContext.state == 'suspended') await appAudioContext.resume()

	if (nowPlaying.value.id && nowPlaying.value.state == 'playing' && nowPlaying.value.id != id) files.value.find(f => f.id == nowPlaying.value.id).audioEl.pause()
	const newFile = files.value.find(f => f.id == id)
	newFile.audioEl.currentTime = time
	if (newFile.audioEl.paused) newFile.audioEl.play()
}
export function setFirstPlayableFile() {
	if (!files.value.some(f => f.status == 'completed')) return

	const firstPlayable = files.value.find(f => f.status == 'completed')
	Object.assign(nowPlaying.value, {
		id: firstPlayable.id,
		state: 'paused'
	})
}

export function onTimeUpdate(e) {
	if (e.target.dataset?.id != nowPlaying.value.id) return
	positionsMap.value[e.target.dataset.id] = e.target.currentTime
}
export function onPause(e) {
	if (e.target.dataset?.id != nowPlaying.value.id) return
	nowPlaying.value.state = 'paused'
	setMediaSessionHandlers()
}
export function onPlay(e) {
	Object.assign(nowPlaying.value, {
		id: e.target.dataset.id,
		state: 'playing'
	})
	positionsMap.value[e.target.dataset.id] = e.target.currentTime
	setMediaSessionHandlers()
}
export function onEnd(e) {
	if (e.target.dataset?.id != nowPlaying.value.id) return
	nowPlaying.value.state = 'paused'
}

/* media sessions handlers */
export function setMediaSessionHandlers() {
	if (!("mediaSession" in navigator)) return

	if (files.value.length > 0 && currentPlayingFile.value && currentPlayingFile.value?.id) {
		let metadataObject = {
			title: currentPlayingFile.value.name,
			artwork: [{src: '/pwa-192x192.png'}]
		}

		navigator.mediaSession.setActionHandler('play', () => togglePlay(currentPlayingFile.value.id))
		navigator.mediaSession.setActionHandler('pause', () => togglePlay(currentPlayingFile.value.id))
		navigator.mediaSession.setActionHandler('seekbackward', seekRW)
		navigator.mediaSession.setActionHandler('seekforward', seekFW)
		navigator.mediaSession.setActionHandler('previoustrack', isFirstPlayableTrack.value ? null : playPrev)
		navigator.mediaSession.setActionHandler('nexttrack', isLastPlayableTrack.value ? null : playNext)
		navigator.mediaSession.playbackState = nowPlaying.value.state
		navigator.mediaSession.metadata = new MediaMetadata(metadataObject)
	} else {
		navigator.mediaSession.metadata = null;
  		navigator.mediaSession.playbackState = 'none';
	}
}