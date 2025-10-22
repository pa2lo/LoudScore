import './css/app.css'

import { createApp } from 'vue'
import App from './App.vue'

if (localStorage.getItem('colorTheme')) {
	let storageTheme = JSON.parse(localStorage.getItem('colorTheme'))
	if (storageTheme == 'light') document.documentElement.classList.add('theme-light')
	else if (storageTheme == 'dark') document.documentElement.classList.add('theme-dark')

	document.querySelector('meta[name="theme-color"]').setAttribute('content', storageTheme == 'dark' ? '#111111' : '#f8f8f8')
} else document.querySelector('meta[name="theme-color"]').setAttribute('content', window.matchMedia('(prefers-color-scheme: dark)').matches ? '#111111' : '#f8f8f8')

createApp(App).mount('#app')
