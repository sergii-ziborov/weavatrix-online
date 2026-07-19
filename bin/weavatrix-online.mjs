#!/usr/bin/env node
import {startOnlineMcp} from '../src/launcher.mjs'

startOnlineMcp().catch((error) => {
  process.stderr.write(`[weavatrix-online] ${error.message}\n`)
  process.exitCode = 1
})
