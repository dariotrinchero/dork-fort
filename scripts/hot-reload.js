/**
 * Script taken verbatim from https://esbuild.github.io/api/#live-reload.
 * 
 * This file is automatically injected into non-production builds via the "inject" build option
 * of ESBuild (see https://esbuild.github.io/api/#inject). It subscribes the browser to the
 * server-sent "/esbuild" event source, and reloads on each "change" event.
 */

new EventSource('/esbuild').addEventListener('change', () => location.reload())