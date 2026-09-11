<script setup>
import { computed, ref } from 'vue'
import { IconFolders, IconX, IconChevronDown } from '@tabler/icons-vue'
import { files, analyzing } from '@/store'
import { sessions, activeSession, busy, loadSession, saveSession, newSession, deleteSession as removeSession } from '@/sessions'

const name = ref('')
const disabled = computed(() => busy.value || analyzing.value || (activeSession.value == 'draft' && !files.value.length))
const saveSessionEl = ref(null)
const popoverEl = ref(null)
const savedSessions = computed(() => sessions.value.filter(s => s.id != 'draft'))

async function save() {
	if (!name.value) return

	saveSessionEl.value.close()
	await saveSession(name.value)
	name.value = ''
}
function load(id) {
	popoverEl.value.hidePopover()
	loadSession(id)
}
function createNewSession() {
	name.value = ''
	popoverEl.value.hidePopover()
	newSession()
}
async function deleteSession(id) {
	await removeSession(id)
}
</script>
<template>
	<button class="button button-light button-narrower sessions-toggle" popovertarget="sessionsPopover" aria-label="Sessions">
		<IconFolders class="button-ico" />
		<span class="m-hide">Sessions</span>
		<IconChevronDown class="levelmodel-toggle-arrow" />
	</button>
	<div id="sessionsPopover" class="app-popover sessions-popover" popover ref="popoverEl">
		<button v-if="files.length || activeSession !== 'draft'" class="popover-option session-entry" :disabled="busy || analyzing || disabled" @click="createNewSession">New session</button>
		<p v-if="!savedSessions.length && !files.length">No saved sessions</p>
		<div v-if="savedSessions.length" class="saved-sessions-section">
			<button v-for="session in savedSessions" :key="session.id" class="popover-option session-entry" :class="{ isActive: activeSession === session.id }" :disabled="busy || analyzing" @click="load(session.id)">
				<span class="session-entry-inner">
					<span>{{ session.name }}</span><small>{{ session.files.length }} files{{ activeSession === session.id ? ' · Active' : '' }}</small>
				</span>
				<span class="button-x" @click.stop="deleteSession(session.id)"><IconX /></span>
			</button>
		</div>
		<div v-if="activeSession === 'draft' && files.length" class="saved-sessions-section">
			<button @click="saveSessionEl.showModal()" class="button popover-button button-full" :disabled="disabled">Save session</button>
		</div>
	</div>

	<dialog ref="saveSessionEl" closedby="any" class="dialog">
		<form v-if="files.length" @submit.prevent="save">
			<div class="modal-title flex ai-c">
				<span class="color-heading">Save session</span>
				<button type="button" class="modal-x" @click="saveSessionEl.close()"><IconX /></button>
			</div>
			<div class="setting">
				<label for="session-name" class="setting-title">Session name</label>
				<input id="session-name" v-model="name" maxlength="100" placeholder="Name this session" required minlength="2" />
			</div>
			<div class="setting">
				<button class="button button-full" type="submit" :disabled="!name.length">Save session</button>
			</div>
		</form>
	</dialog>
</template>
