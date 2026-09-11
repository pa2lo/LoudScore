let database
export function openDatabase() {
	if (!database) database = new Promise((resolve, reject) => {
		const request = indexedDB.open('loudscore-sessions', 2)
		request.onupgradeneeded = () => {
			const database = request.result
			if (!database.objectStoreNames.contains('sessions')) database.createObjectStore('sessions', { keyPath: 'id' })
			if (!database.objectStoreNames.contains('analysis')) database.createObjectStore('analysis', { keyPath: 'id' })
		}
		request.onsuccess = () => {
			request.result.onversionchange = () => {
				request.result.close()
				database = null
			}
			resolve(request.result)
		}
		request.onerror = () => {
			database = null
			reject(request.error)
		}
		request.onblocked = () => {
			database = null
			reject(new Error('Close other LoudScore tabs and reload to enable storage.'))
		}
	})
	return database
}
export async function db(store, operation, ...args) {
	const database = await openDatabase()
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(store, ['get', 'getAll'].includes(operation) ? 'readonly' : 'readwrite')
		const request = transaction.objectStore(store)[operation](...args)
		transaction.oncomplete = () => resolve(request.result)
		transaction.onerror = () => reject(transaction.error)
		transaction.onabort = () => reject(transaction.error || new Error('Storage transaction aborted'))
	})
}

export async function cleanupAnalysis(removedAnalysisIds, activeAnalysisIds = []) {
	if (!removedAnalysisIds.length) return
	const database = await openDatabase()
	return new Promise((resolve, reject) => {
		// Read references and delete unused cache entries in one transaction.
		const transaction = database.transaction(['sessions', 'analysis'], 'readwrite')
		const referenced = new Set(activeAnalysisIds)
		const sessions = transaction.objectStore('sessions').getAll()
		sessions.onsuccess = () => {
			for (const session of sessions.result) {
				for (const file of session.files) referenced.add(file.analysisId || file.id)
			}
			const analysis = transaction.objectStore('analysis')
			for (const id of new Set(removedAnalysisIds)) {
				if (!referenced.has(id)) analysis.delete(id)
			}
		}
		transaction.oncomplete = () => resolve()
		transaction.onerror = () => reject(transaction.error)
		transaction.onabort = () => reject(transaction.error || new Error('Analysis cleanup aborted'))
	})
}
