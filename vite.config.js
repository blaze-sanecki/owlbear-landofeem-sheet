import { defineConfig } from "vite";

import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
	build: {
		rollupOptions: {
			input: {
				main: resolve(__dirname, "index.html"),
				notification: resolve(__dirname, "notification.html"),
				modifier: resolve(__dirname, "modifier.html"),
			},
		},
	},
	server: {
		cors: true,
	},
});