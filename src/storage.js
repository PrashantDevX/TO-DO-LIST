const DB_NAME = 'daymark-tasks'
const DB_VERSION = 1
const TASKS = 'tasks'
const SETTINGS = 'settings'

let databasePromise

function openDatabase() {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('This browser does not support IndexedDB.'))
  }
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(TASKS)) db.createObjectStore(TASKS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      databasePromise = undefined
      reject(request.error ?? new Error('Could not open local task storage.'))
    }
    request.onblocked = () => {
      databasePromise = undefined
      reject(new Error('Local task storage is blocked by another open app tab.'))
    }
  })
  return databasePromise
}

function runTransaction(storeNames, mode, operation) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode)
        let result
        try {
          result = operation(transaction)
        } catch (error) {
          reject(error)
          return
        }
        transaction.oncomplete = () => resolve(result)
        transaction.onerror = () => reject(transaction.error ?? new Error('Local storage operation failed.'))
        transaction.onabort = () => reject(transaction.error ?? new Error('Local storage operation was cancelled.'))
      }),
  )
}

function isTaskRecord(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.completed === 'boolean' &&
    ['low', 'medium', 'high'].includes(value.priority) &&
    typeof value.order === 'number'
  )
}

export async function loadAppData() {
  const db = await openDatabase()
  const [rawTasks, rawSettings] = await new Promise((resolve, reject) => {
    const transaction = db.transaction([TASKS, SETTINGS], 'readonly')
    const tasksRequest = transaction.objectStore(TASKS).getAll()
    const settingsRequest = transaction.objectStore(SETTINGS).get('app')
    transaction.oncomplete = () => resolve([tasksRequest.result, settingsRequest.result?.value])
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not read local task data.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not read local task data.'))
  })
  const validTasks = Array.isArray(rawTasks) ? rawTasks.filter(isTaskRecord) : []
  const skippedCount = Array.isArray(rawTasks) ? rawTasks.length - validTasks.length : 0
  return {
    tasks: validTasks,
    settings:
      rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)
        ? rawSettings
        : {},
    skippedCount,
  }
}

export function saveTask(task) {
  return runTransaction([TASKS], 'readwrite', (transaction) => transaction.objectStore(TASKS).put(task))
}

export function removeTask(id) {
  return runTransaction([TASKS], 'readwrite', (transaction) => transaction.objectStore(TASKS).delete(id))
}

export function saveAllTasks(tasks) {
  return runTransaction([TASKS], 'readwrite', (transaction) => {
    const store = transaction.objectStore(TASKS)
    store.clear()
    tasks.forEach((task) => store.put(task))
  })
}

export function saveSettings(settings) {
  return runTransaction([SETTINGS], 'readwrite', (transaction) =>
    transaction.objectStore(SETTINGS).put({ id: 'app', value: settings }),
  )
}

export function saveTasksAndSettings(tasks, settings) {
  return runTransaction([TASKS, SETTINGS], 'readwrite', (transaction) => {
    const taskStore = transaction.objectStore(TASKS)
    taskStore.clear()
    tasks.forEach((task) => taskStore.put(task))
    transaction.objectStore(SETTINGS).put({ id: 'app', value: settings })
  })
}
