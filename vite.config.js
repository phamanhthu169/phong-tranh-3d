import { defineConfig } from 'vite'
import { createServer } from 'vite'

export default defineConfig({
  base: '/',
  appType: 'spa',
  server: {
    middlewareMode: false,
  },
  plugins: [
    {
      name: 'serve-public-files',
      configureServer(server) {
        server.middlewares.use('/sounds', (req, res, next) => {
          next()
        })
      },
    },
  ],
})