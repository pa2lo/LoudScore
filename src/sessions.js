import { ref, markRaw, watch, toRaw } from 'vue'
import { files, analyzing, nowPlaying, positionsMap } from './store'
import { setFirstPlayableFile, setMediaSessionHandlers } from './audio'
import { analyzeFile } from './analysis'
import { enqueueAnalysis, createSharedAnalysis } from './analysis-queue'
import { db, cleanupAnalysis } from './session-db'
import { useStorage } from './composables/BrowserStorage'

export const supportsSessions = typeof window.showOpenFilePicker === 'function'
export const sessions = ref([])
export const activeSession = useStorage('activeSession', 'draft')
export const busy = ref(true)
export const storageError = ref('')
export const inputError = ref('')
const analysisVersion = 1
const sharedAnalysis = createSharedAnalysis()
const rowJobs = new Map()
let ready = false
let writes = Promise.resolve()
const pickerOptions = {
	multiple: true,
	types: [{
		description: 'Audio files',
		accept: {
			'audio/*': ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.aiff', '.opus', '.webm']
		}
	}]
}

function storageFailure(error) {
	storageError.value = 'Unable to save browser data. Your current files are still available. ' + (error?.message || '')
}
function snapshot() {
	return files.value.map(f => ({
		id: f.id,
		name: f.name,
		analysisId: f.analysisId || null,
		handle: f.handle ? toRaw(f.handle) : null
	}))
}
export function persistSession(removedAnalysisIds = []) {
	if (!ready) return writes
	if (!supportsSessions) {
		writes = writes.then(() => cleanupAnalysis(removedAnalysisIds, files.value.map(analysisIdFor))).catch(storageFailure)
		return writes
	}
	const id = activeSession.value
	const record = {
		id,
		name: sessions.value.find(s => s.id === id)?.name || '',
		files: snapshot(),
		updatedAt: Date.now(),
	}
	writes = writes.then(async () => {
		const previous = await db('sessions', 'get', id)
		const retainedIds = new Set(record.files.map(analysisIdFor))
		const removedIds = (previous?.files || []).map(analysisIdFor).filter(id => !retainedIds.has(id))
		await db('sessions', 'put', record)
		await cleanupAnalysis(removedIds, files.value.map(analysisIdFor))
		sessions.value = await db('sessions', 'getAll')
	}).catch(storageFailure)
	return writes
}
watch(() => files.value.map(f => [analysisIdFor(f), f.handle]), (current, previous) => {
	const retainedIds = new Set(current.map(([id]) => id))
	persistSession(previous.filter(([id]) => !retainedIds.has(id)).map(([id]) => id))
})

function row(entry) {
	return {
		...entry,
		handle: entry.handle ? markRaw(entry.handle) : null,
		status: 'queued',
		progress: null,
		duration: 0,
		waveform: [],
		audioSrc: null,
		audioEl: null,
		audioSource: null,
		gainNode: null
	}
}
export function cancelFile(item) {
	const controller = rowJobs.get(item.id)
	if (!controller) return
	controller.abort()
	item.status = 'cancelled'
	item.progress = null
}
// A queued import can be removed while the initial session write is pending.
async function loadRow(item, file) {
	if (!item) return
	const controller = new AbortController()
	const { signal } = controller
	rowJobs.set(item.id, controller)
	item.status = 'queued'
	item.progress = null
	try {
		await enqueueAnalysis(async () => {
			signal.throwIfAborted()
			item.status = 'decoding'
			item.needsPermission = false
			if (!file) {
				if (!item.handle) throw new Error('Select this file again to restore access.')
				if (await item.handle.queryPermission({ mode: 'read' }) !== 'granted') {
					item.needsPermission = true
					throw new Error('Permission required to open this file.')
				}
				signal.throwIfAborted()
				file = await item.handle.getFile()
			}
			item.needsPermission = false
			item.error = ''
			signal.throwIfAborted()
			const bytes = await file.arrayBuffer()
			signal.throwIfAborted()
			const hash = await crypto.subtle.digest('SHA-256', bytes)
			const fingerprint = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
			signal.throwIfAborted()
			item.analysisId = `v${analysisVersion}:${fingerprint}`
			const result = await cachedAnalysis(file, bytes, item.analysisId, signal, progress => {
				if (!signal.aborted) Object.assign(item, progress)
			})
			signal.throwIfAborted()
			item.audioSrc = URL.createObjectURL(file)
			Object.assign(item, result)
		}, signal)
	} catch (error) {
		if (signal.aborted) {
			item.status = 'cancelled'
			return
		}
		item.status = 'error'
		item.error = error.name === 'NotFoundError' ? 'File missing. It may have been moved or deleted.' : error.name === 'NotAllowedError' ? 'Permission required to open this file.' : error.message
		if (error.name === 'NotAllowedError') item.needsPermission = true
	} finally {
		if (rowJobs.get(item.id) === controller) rowJobs.delete(item.id)
	}
}
// Older session records used the track ID as their cache key.
function analysisIdFor(file) {
	return file.analysisId || file.id
}
async function cachedAnalysis(file, bytes, id, signal, onProgress) {
	return sharedAnalysis(id, async (sharedSignal, report) => {
		try {
			const cached = await db('analysis', 'get', id)
			sharedSignal.throwIfAborted()
			if (cached) return { ...cached.result, progress: 100 }
		} catch (error) {
			sharedSignal.throwIfAborted()
			storageFailure(error)
		}
		const result = await analyzeFile(file, bytes, { signal: sharedSignal, onProgress: report })
		sharedSignal.throwIfAborted()
		try { await db('analysis', 'put', { id, result }) }
		catch (error) { storageFailure(error) }
		return result
	}, signal, onProgress)
}
function finishLoading() {
	setFirstPlayableFile()
	setMediaSessionHandlers()
}
export function disposeFile(file) {
	cancelFile(file)
	file.audioEl?.pause()
	if (file.audioEl) {
		file.audioEl.removeAttribute('src')
		file.audioEl.load()
	}
	file.gainNode?.disconnect()
	file.audioSource?.disconnect()
	if (file.audioSrc) URL.revokeObjectURL(file.audioSrc)
}
export function newSession() {
	return loadSession('draft', true)
}
export async function loadSession(id, clearDraft = false) {
	if (busy.value || analyzing.value) return
	busy.value = true
	await persistSession()
	try {
		const record = clearDraft && id === 'draft' ? null : await db('sessions', 'get', id)
		ready = false
		files.value.forEach(disposeFile)
		nowPlaying.value = { id: null, state: null }
		positionsMap.value = {}
		activeSession.value = id
		files.value = (record?.files || []).map(row)
		await Promise.all(files.value.map(f => loadRow(f)))
		finishLoading()
	} catch (error) {
		storageFailure(error)
	} finally {
		ready = true
		busy.value = false
		await persistSession()
	}
}
export async function initializeSessions() {
	if (supportsSessions) {
		try {
			sessions.value = await db('sessions', 'getAll')
			const storedId = activeSession.value
			const id = sessions.value.some(session => session.id === storedId) ? storedId : 'draft'
			busy.value = false
			await loadSession(id)
		} catch (error) {
			storageFailure(error)
		}
	}
	ready = true
	busy.value = false
}
export async function saveSession(name) {
	if (!name.trim() || busy.value || analyzing.value) return
	busy.value = true
	await persistSession()
	const id = crypto.randomUUID()
	const record = {
		id,
		name: name.trim(),
		files: snapshot(),
		updatedAt: Date.now()
	}
	try {
		await db('sessions', 'put', record)
		activeSession.value = id
		sessions.value = await db('sessions', 'getAll')
		await persistSession()
		const draft = await db('sessions', 'get', 'draft')
		await db('sessions', 'delete', 'draft')
		await cleanupAnalysis((draft?.files || []).map(analysisIdFor), files.value.map(analysisIdFor))
		sessions.value = await db('sessions', 'getAll')
		navigator.storage?.persist?.().catch(() => {})
	} catch (error) {
		storageFailure(error)
	} finally {
		busy.value = false
	}
}
export async function deleteSession(id) {
	if (busy.value || analyzing.value || id === 'draft' || !sessions.value.some(session => session.id === id)) return

	// Switch away first so autosave cannot recreate the deleted session.
	if (activeSession.value === id) await loadSession('draft')
	if (activeSession.value === id) return

	busy.value = true
	try {
		await writes
		const session = await db('sessions', 'get', id)
		await db('sessions', 'delete', id)
		sessions.value = sessions.value.filter(session => session.id !== id)
		await cleanupAnalysis((session?.files || []).map(analysisIdFor), files.value.map(analysisIdFor))
	} catch (error) {
		storageFailure(error)
	} finally {
		busy.value = false
	}
}
export async function addFiles(entries) {
	if (busy.value || analyzing.value || !entries.length) return
	analyzing.value = true
	const added = entries.map(({ file, handle }) => row({
		id: crypto.randomUUID(),
		name: (file?.name || handle.name).replace(/\.[^/.]+$/, ''),
		handle
	}))
	files.value.push(...added)
	await persistSession()
	await Promise.all(added.map((item, index) => loadRow(files.value.find(f => f.id === item.id), entries[index].file)))
	await persistSession()
	analyzing.value = false
	if (!nowPlaying.value.id) finishLoading()
}
export async function pickFiles() {
	inputError.value = ''
	try {
		const handles = await window.showOpenFilePicker(pickerOptions)
		await addFiles(handles.map(handle => ({ handle })))
	} catch (error) {
		if (error.name !== 'AbortError') inputError.value = error.message
	}
}
export async function reconnectFile(item) {
	if (busy.value || analyzing.value) return
	// Invoke the permission prompt or picker directly in the click handler.
	const request = item.needsPermission && item.handle
		? item.handle.requestPermission({ mode: 'read' })
		: window.showOpenFilePicker({ ...pickerOptions, multiple: false })
	busy.value = true
	try {
		const result = await request
		if (typeof result === 'string') {
			if (result !== 'granted') return
		} else {
			item.handle = markRaw(result[0])
			item.name = result[0].name.replace(/\.[^/.]+$/, '')
		}
		// One browser prompt can grant access to several saved handles. Recheck
		// every blocked file without prompting again or reloading playable tracks.
		const pending = files.value.filter(file => file.id !== item.id && file.needsPermission && file.handle)
		await Promise.all([item, ...pending].map(file => loadRow(file)))
		if (!nowPlaying.value.id) finishLoading()
		await persistSession()
	} catch (error) {
		if (error.name !== 'AbortError') inputError.value = error.message
	} finally {
		busy.value = false
	}
}
