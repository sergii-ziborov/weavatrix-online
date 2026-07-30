import {readdirSync, readFileSync} from 'node:fs'
import {extname, join, relative, sep} from 'node:path'
import process from 'node:process'

const ROOT = new URL('../', import.meta.url)
const MAX_FILE_LOC = 300
const MAX_FUNCTION_LOC = 100
const SOURCE_ROOTS = ['src', 'bin', 'scripts']

function sourceFiles() {
  const files = []
  const stack = SOURCE_ROOTS.map((path) => new URL(`${path}/`, ROOT))
  while (stack.length) {
    const directory = stack.pop()
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      const url = new URL(entry.name, directory)
      if (entry.isDirectory()) {
        stack.push(new URL(`${entry.name}/`, directory))
      } else if (entry.isFile() && ['.js', '.mjs', '.cjs'].includes(extname(entry.name))) {
        files.push(url)
      }
    }
  }
  return files.sort((left, right) => left.pathname.localeCompare(right.pathname))
}

function maskCommentsAndStrings(source) {
  const chars = [...source]
  let state = 'code'
  let escaped = false
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]
    const next = chars[index + 1]
    if (state === 'line-comment') {
      if (char === '\n') state = 'code'
      else chars[index] = ' '
      continue
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        chars[index] = ' '
        chars[index + 1] = ' '
        index += 1
        state = 'code'
      } else if (char !== '\n') {
        chars[index] = ' '
      }
      continue
    }
    if (state !== 'code') {
      if (char === '\n') continue
      chars[index] = ' '
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === state) {
        state = 'code'
      }
      continue
    }
    if (char === '/' && next === '/') {
      chars[index] = ' '
      chars[index + 1] = ' '
      index += 1
      state = 'line-comment'
    } else if (char === '/' && next === '*') {
      chars[index] = ' '
      chars[index + 1] = ' '
      index += 1
      state = 'block-comment'
    } else if (char === "'" || char === '"' || char === '`') {
      chars[index] = ' '
      state = char
    }
  }
  return chars.join('')
}

function functionRanges(source) {
  const masked = maskCommentsAndStrings(source)
  const starts = /\b(?:async\s+)?function(?:\s*\*)?\s*[A-Za-z_$]*\s*\([^)]*\)\s*\{|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g
  const ranges = []
  for (const match of masked.matchAll(starts)) {
    const open = match.index + match[0].lastIndexOf('{')
    let depth = 0
    for (let index = open; index < masked.length; index += 1) {
      if (masked[index] === '{') depth += 1
      else if (masked[index] === '}') depth -= 1
      if (depth !== 0) continue
      const startLine = masked.slice(0, match.index).split('\n').length
      const endLine = masked.slice(0, index).split('\n').length
      ranges.push({startLine, endLine, loc: endLine - startLine + 1})
      break
    }
  }
  return ranges
}

const failures = []
let maxFile = {loc: 0, path: ''}
let maxFunction = {loc: 0, path: '', startLine: 0}
for (const url of sourceFiles()) {
  const source = readFileSync(url, 'utf8')
  const path = relative(
    new URL('.', ROOT).pathname,
    url.pathname,
  ).split(sep).join('/').replace(/^\/+/, '')
  const loc = source.split(/\r?\n/).length
  if (loc > maxFile.loc) maxFile = {loc, path}
  if (loc > MAX_FILE_LOC) failures.push(`${path}: ${loc} lines > ${MAX_FILE_LOC}`)
  for (const range of functionRanges(source)) {
    if (range.loc > maxFunction.loc) {
      maxFunction = {loc: range.loc, path, startLine: range.startLine}
    }
    if (range.loc > MAX_FUNCTION_LOC) {
      failures.push(
        `${path}:${range.startLine}: function ${range.loc} lines > ${MAX_FUNCTION_LOC}`,
      )
    }
  }
}

if (failures.length) {
  process.stderr.write(`source budget violations:\n- ${failures.join('\n- ')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(
    `source budgets passed: max file ${maxFile.loc} (${maxFile.path}); `
      + `max function ${maxFunction.loc} (${maxFunction.path}:${maxFunction.startLine})\n`,
  )
}
