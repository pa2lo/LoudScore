<script setup>
const model = defineModel()
const props = defineProps({
	options: Array,
	label: String,
	name: String
})
</script>

<template>
	<div class="setting">
		<div v-if="label" class="setting-title">{{ label }}</div>
		<div class="setting-options">
			<label v-for="option in options" class="setting-label">
				<input type="radio" :name="name" :value="option.value" v-model="model" />
				<span class="setting-options-text">{{ option.title }}</span>
			</label>
		</div>
		<div v-if="$slots.default" class="setting-info">
			<slot />
		</div>
	</div>
</template>