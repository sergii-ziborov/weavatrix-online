import assert from 'node:assert/strict'
import test from 'node:test'
import {validateOnlineArgs} from '../src/launcher.mjs'

const directories = new Set(['C:/repo', 'C:/repo-two'])
const isDirectory = (path) => directories.has(path)

test('repository form is composed in-process with the Online profile', () => {
  assert.deepEqual(validateOnlineArgs(['C:/repo'], isDirectory), ['C:/repo'])
})

test('explicit graph form preserves its local graph and root', () => {
  assert.deepEqual(
    validateOnlineArgs(['C:/graphs/graph.json', 'C:/repo-two'], isDirectory),
    ['C:/graphs/graph.json', 'C:/repo-two'],
  )
})

test('the wrapper rejects missing roots and profile overrides', () => {
  assert.throws(() => validateOnlineArgs([], isDirectory), /Usage/)
  assert.throws(() => validateOnlineArgs(['graph.json', 'missing'], isDirectory), /existing repository directory/)
  assert.throws(() => validateOnlineArgs(['C:/repo', 'online'], isDirectory), /exactly one/)
  assert.throws(() => validateOnlineArgs(['C:/repo', 'online', 'extra'], isDirectory), /overrides are not accepted/)
})
