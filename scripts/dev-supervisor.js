const { spawn } = require('node:child_process')
const { join } = require('node:path')

const DEV_RESTART_EXIT_CODE = 42
const electronViteCli = join(process.cwd(), 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
const electronViteArgs = ['dev', '--', '--no-sandbox', '--in-process-gpu', ...process.argv.slice(2)]
const childEnvironment = {
  ...process.env,
  AIVPLAYER_DEV_SUPERVISOR: '1'
}

function startDevServer() {
  const child = spawn(process.execPath, [electronViteCli, ...electronViteArgs], {
    cwd: process.cwd(),
    env: childEnvironment,
    stdio: 'inherit'
  })

  child.once('error', (error) => {
    console.error(`failed to start electron-vite: ${error.message}`)
    process.exitCode = 1
  })

  child.once('exit', (code, signal) => {
    if (code === DEV_RESTART_EXIT_CODE) {
      setTimeout(startDevServer, 100)
      return
    }

    process.exitCode = code ?? (signal ? 1 : 0)
  })
}

startDevServer()
