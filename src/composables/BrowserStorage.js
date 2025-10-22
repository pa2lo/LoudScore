import { ref, watch } from "vue"

export function useStorage(key, defaultVal = '', saveIfNotExist = false) {
	let storedVal = JSON.parse(localStorage.getItem(key))

	const isObject = typeof defaultVal == 'object'
	const isArray = Array.isArray(defaultVal)
	const compareArr = isArray ? defaultVal.toString() : null

	let val = ref(storedVal != undefined ? storedVal : isObject ? JSON.parse(JSON.stringify(defaultVal)) : defaultVal)

	if (!storedVal && defaultVal && saveIfNotExist) localStorage.setItem(key, JSON.stringify(val.value))

	watch(val, () => {
		if ((val.value === null || val.value == '' || val.value == defaultVal || (isArray && val.value.toString() == compareArr)) && val.value !== 0) localStorage.removeItem(key)
		else localStorage.setItem(key, JSON.stringify(val.value))
	}, { deep: isObject })

	return val
}