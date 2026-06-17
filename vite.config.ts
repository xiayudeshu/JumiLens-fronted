import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import glsl from 'vite-plugin-glsl'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')

    return {
        plugins: [react(), glsl(), tailwindcss()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src')
            }
        },
        server: {
            host: '0.0.0.0',
            port: 9000,
            proxy: {
                '/api': {
                    target: env.VITE_API_PROXY_TARGET || 'http://172.24.202.122:8080',
                    changeOrigin: true
                },
                '/msg': {
                    target: env.VITE_MSG_PROXY_TARGET || 'http://xxx.dev.xxx.com:8133',
                    changeOrigin: true
                }
            }
        }
    }
})