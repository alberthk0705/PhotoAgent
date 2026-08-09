import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/, so assets need that prefix.
  // Change this if the repo is renamed; use '/' for a <user>.github.io repo.
  base: '/PhotoAgent/',
  plugins: [react(), tailwindcss()],
})
