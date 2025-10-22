import { ref } from "vue"
import { useStorage } from "./composables/BrowserStorage"

export let levelModel = ref('original')
export let files = ref([])
export let analyzing = ref(false)
export let nowPlaying = ref({
	id: null,
	state: null
})
export let positionsMap = ref({})

export let waveformDisplay = useStorage('waveformDisplay', 'real')
export let colorTheme = useStorage('colorTheme', '')
export let switchTrackMode = useStorage('switchTrackMode', '')
export let seekTime = useStorage('seekTime', 5)
export let trackEndMode = useStorage('trackEndMode', '')