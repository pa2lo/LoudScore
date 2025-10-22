import { levelModel } from "./store"

export function formatPenalty(val) {
	if (val == 0) return parseFloat(val)
	return val > 0 ? `+${parseFloat(val)}` : parseFloat(val)
}

export function formatMS(s) {
	let mins = Math.floor(s/60)
	let secs = s % 60
	return `${mins}:${String(secs).padStart(2, 0)}`
}

export function getGainValue(file) {
	if (levelModel.value == 'original') return 1
	return Math.pow(10, file[levelModel.value] / 20)
}