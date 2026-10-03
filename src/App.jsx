import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownAZ, ArrowUpDown, CheckCheck, ChevronDown, CircleHelp, Download,
  FileText, GripVertical, ListFilter, Moon, Plus, Search, Sparkles, Sun, Upload, X,
} from 'lucide-react'
import TaskDialog from './components/TaskDialog.jsx'
import TaskItem from './components/TaskItem.jsx'
import { loadAppData, removeTask, saveAllTasks, saveSettings, saveTask, saveTasksAndSettings } from './storage.js'
import { createTask, localDateString, taskIdentity, taskMatchesView, validateImportedTask, parseCsv } from './taskUtils.js'

const INITIAL_SETTINGS = { theme: 'light', view: 'All tasks', sort: 'manual', search: '', category: 'All categories' }
const VIEW_ICONS = { 'All tasks': '◫', Today: '◷', Upcoming: '▧', Active: '◯', Completed: '✓', Overdue: '◴' }

function downloadFile(filename, type, content) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function toCsv(tasks) {
  const fields = ['title', 'description', 'priority', 'due date', 'category', 'completed']
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  return [fields.map(quote).join(','), ...tasks.map((task) => [
    task.title, task.description, task.priority, task.dueDate, task.category, task.completed,
  ].map(quote).join(','))].join('\r\n')
}

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

export default function App() {
  const [tasks, setTasks] = useState([])
  const [settings, setSettings] = useState(INITIAL_SETTINGS)
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [dialogTask, setDialogTask] = useState(undefined)
  const [toast, setToast] = useState(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [draggedId, setDraggedId] = useState(null)
  const [categoryMenu, setCategoryMenu] = useState(false)
  const importInput = useRef(null)
  const searchInput = useRef(null)
  const settingsRef = useRef(INITIAL_SETTINGS)
  const toastTimer = useRef()

  useEffect(() => {
    let active = true
    loadAppData()
      .then(({ tasks: savedTasks, settings: savedSettings, skippedCount }) => {
        if (!active) return
        setTasks(savedTasks)
        const nextSettings = {
          ...INITIAL_SETTINGS,
          ...savedSettings,
          theme: savedSettings.theme === 'dark' ? 'dark' : 'light',
          view: ['All tasks', 'Today', 'Upcoming', 'Active', 'Completed', 'Overdue'].includes(savedSettings.view) ? savedSettings.view : 'All tasks',
          sort: ['manual', 'dueDate', 'priority', 'title'].includes(savedSettings.sort) ? savedSettings.sort : 'manual',
          search: typeof savedSettings.search === 'string' ? savedSettings.search : '',
          category: typeof savedSettings.category === 'string' ? savedSettings.category : 'All categories',
        }
        settingsRef.current = nextSettings
        setSettings(nextSettings)
        setReady(true)
        if (skippedCount) notify(`${skippedCount} damaged task${skippedCount === 1 ? '' : 's'} skipped. The rest of your list is safe.`)
      })
      .catch((error) => {
        if (!active) return
        setStorageError(error.message)
        setReady(true)
        notify('Your local task storage could not be opened. No changes have been made.')
      })
    return () => {
      active = false
      window.clearTimeout(toastTimer.current)
    }
  }, [])

  useEffect(() => {
    function handleShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInput.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.theme === 'dark' ? '#171923' : '#f7f8fc')
  }, [settings.theme])

  function notify(message, kind = 'success') {
    window.clearTimeout(toastTimer.current)
    setToast({ message, kind })
    toastTimer.current = window.setTimeout(() => setToast(null), 3400)
  }

  async function updateSettings(changes) {
    const previous = settingsRef.current
    const next = { ...previous, ...changes }
    settingsRef.current = next
    setSettings(next)
    try {
      await saveSettings(next)
    } catch (error) {
      if (settingsRef.current === next) {
        settingsRef.current = previous
        setSettings(previous)
      }
      notify(`Could not save this preference: ${error.message}`, 'error')
    }
  }

  async function handleSave(fields) {
    const next = dialogTask
      ? { ...dialogTask, ...fields, updatedAt: new Date().toISOString() }
      : createTask(fields, tasks.length ? Math.max(...tasks.map((task) => task.order)) + 1 : 0)
    try {
      await saveTask(next)
      setTasks((current) => dialogTask
        ? current.map((task) => task.id === next.id ? next : task)
        : [...current, next])
      setDialogTask(undefined)
      notify(dialogTask ? 'Task updated. Nice and tidy.' : 'Task added to your list.')
    } catch (error) {
      notify(`Could not save the task: ${error.message}`, 'error')
    }
  }

  async function toggleTask(task) {
    const next = { ...task, completed: !task.completed, updatedAt: new Date().toISOString() }
    try {
      await saveTask(next)
      setTasks((current) => current.map((item) => item.id === task.id ? next : item))
      notify(next.completed ? 'One less thing to think about.' : 'Task moved back to active.')
    } catch (error) {
      notify(`Could not update this task: ${error.message}`, 'error')
    }
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return
    try {
      await removeTask(task.id)
      setTasks((current) => current.filter((item) => item.id !== task.id))
      notify('Task deleted.')
    } catch (error) {
      notify(`Could not delete the task: ${error.message}`, 'error')
    }
  }

  async function reorderTasks(targetId) {
    if (!draggedId || draggedId === targetId) return
    const ordered = [...tasks].sort((a, b) => a.order - b.order)
    const from = ordered.findIndex((task) => task.id === draggedId)
    const to = ordered.findIndex((task) => task.id === targetId)
    if (from < 0 || to < 0) return
    const [moved] = ordered.splice(from, 1)
    ordered.splice(to, 0, moved)
    const reordered = ordered.map((task, index) => ({ ...task, order: index }))
    const nextSettings = { ...settingsRef.current, sort: 'manual' }
    try {
      await saveTasksAndSettings(reordered, nextSettings)
      setTasks(reordered)
      settingsRef.current = nextSettings
      setSettings(nextSettings)
    } catch (error) {
      notify(`Could not save the new order: ${error.message}`, 'error')
    }
    setDraggedId(null)
  }

  async function handleExport(format) {
    if (!tasks.length) return notify('Add a task before exporting your list.', 'error')
    const date = new Date().toISOString().slice(0, 10)
    if (format === 'json') downloadFile(`daymark-tasks-${date}.json`, 'application/json', JSON.stringify({ exportedAt: new Date().toISOString(), tasks }, null, 2))
    if (format === 'csv') downloadFile(`daymark-tasks-${date}.csv`, 'text/csv;charset=utf-8', toCsv(tasks))
    if (format === 'txt') downloadFile(`daymark-tasks-${date}.txt`, 'text/plain;charset=utf-8', tasks.map((task) =>
      `${task.completed ? '[x]' : '[ ]'} ${task.title} (${task.priority})${task.dueDate ? ` · Due ${task.dueDate}` : ''}${task.category ? ` · ${task.category}` : ''}${task.description ? `\n    ${task.description}` : ''}`,
    ).join('\n\n'))
    setTransferOpen(false)
    notify(`Your ${format.toUpperCase()} export is ready.`)
  }

  async function handleImport(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const content = await file.text()
      const inputItems = file.name.toLowerCase().endsWith('.csv')
        ? parseCsv(content)
        : (() => {
          let parsed
          try { parsed = JSON.parse(content) } catch { throw new Error('This file is not valid JSON.') }
          const list = Array.isArray(parsed) ? parsed : parsed?.tasks
          if (!Array.isArray(list)) throw new Error('JSON must contain a task array, either directly or under “tasks”.')
          return list
        })()
      const validated = inputItems.map(validateImportedTask)
      const known = new Set(tasks.map(taskIdentity))
      const uniqueImports = []
      for (const item of validated) {
        const identity = taskIdentity(item)
        if (!known.has(identity)) {
          uniqueImports.push(item)
          known.add(identity)
        }
      }
      if (!uniqueImports.length) return notify('Everything in that file is already on your list.', 'error')
      const newTasks = uniqueImports.map((item, index) =>
        createTask(item, tasks.length + index),
      ).map((task, index) => ({ ...task, completed: uniqueImports[index].completed }))
      const merged = [...tasks, ...newTasks]
      await saveAllTasks(merged)
      setTasks(merged)
      setTransferOpen(false)
      notify(`Imported ${newTasks.length} task${newTasks.length === 1 ? '' : 's'}${validated.length > newTasks.length ? ` · skipped ${validated.length - newTasks.length} duplicate${validated.length - newTasks.length === 1 ? '' : 's'}` : ''}.`)
    } catch (error) {
      notify(`Import failed: ${error.message}`, 'error')
    }
  }

  const categories = useMemo(() => [...new Set(tasks.map((task) => task.category).filter(Boolean))].sort(), [tasks])
  const counts = useMemo(() => {
    const today = localDateString()
    return {
      'All tasks': tasks.length,
      Today: tasks.filter((task) => !task.completed && task.dueDate === today).length,
      Upcoming: tasks.filter((task) => !task.completed && task.dueDate > today).length,
      Active: tasks.filter((task) => !task.completed).length,
      Completed: tasks.filter((task) => task.completed).length,
      Overdue: tasks.filter((task) => !task.completed && task.dueDate && task.dueDate < today).length,
    }
  }, [tasks])
  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((task) =>
      taskMatchesView(task, settings.view) &&
      (settings.category === 'All categories' || task.category === settings.category) &&
      (!settings.search || `${task.title} ${task.description} ${task.category}`.toLocaleLowerCase().includes(settings.search.toLocaleLowerCase())),
    )
    return filtered.sort((a, b) => {
      if (settings.sort === 'title') return a.title.localeCompare(b.title)
      if (settings.sort === 'dueDate') return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31')
      if (settings.sort === 'priority') return ['high', 'medium', 'low'].indexOf(a.priority) - ['high', 'medium', 'low'].indexOf(b.priority)
      return a.order - b.order
    })
  }, [tasks, settings])
  const completedCount = counts.Completed
  const progress = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0

  if (!ready) {
    return <main className="loading-screen"><span className="loading-mark"><CheckCheck size={21} /></span><p>Getting your day in order<span className="loading-dots">...</span></p></main>
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Daymark home" onClick={(event) => { event.preventDefault(); updateSettings({ view: 'All tasks' }) }}>
          <span className="brand-mark"><CheckCheck size={20} strokeWidth={2.3} /></span>
          <span>daymark<span className="brand-period">.</span></span>
        </a>
        <div className="sidebar-label">YOUR SPACE</div>
        <nav className="view-nav" aria-label="Task views">
          {['All tasks', 'Today', 'Upcoming', 'Active', 'Completed', 'Overdue'].map((view) => (
            <button type="button" key={view} className={`nav-link ${settings.view === view ? 'nav-selected' : ''}`} onClick={() => updateSettings({ view })}>
              <span className="nav-glyph">{VIEW_ICONS[view]}</span><span>{view}</span><span className="nav-count">{counts[view]}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-label category-label">CATEGORIES</div>
        <div className="category-list">
          {categories.length ? categories.slice(0, 6).map((category, index) => (
            <button type="button" key={category} className={`category-link ${settings.category === category ? 'category-selected' : ''}`} onClick={() => updateSettings({ category: settings.category === category ? 'All categories' : category, view: 'All tasks' })}>
              <span className={`category-color category-color-${index % 5}`} />{category}
            </button>
          )) : <p className="muted-sidebar">Your categories will appear here.</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="focus-card">
            <span className="focus-icon"><Sparkles size={15} /></span>
            <p>{tasks.length ? 'Little by little' : 'Start with one thing'}</p>
            <span>{tasks.length ? 'You’re making progress.' : 'A clear mind starts here.'}</span>
          </div>
          <button type="button" className="theme-toggle" onClick={() => updateSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' })}>
            {settings.theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            <span>{settings.theme === 'light' ? 'Dark appearance' : 'Light appearance'}</span>
            <span className={`toggle-track ${settings.theme === 'dark' ? 'toggle-on' : ''}`}><i /></span>
          </button>
          <p className="sidebar-footnote"><CircleHelp size={13} /> Your tasks stay on this device</p>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-date">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</div>
          <div className="topbar-actions">
            <div className="transfer-wrap">
              <button type="button" className="button button-quiet transfer-button" onClick={() => setTransferOpen((open) => !open)} aria-expanded={transferOpen}><Download size={16} />Import / export<ChevronDown size={14} /></button>
              {transferOpen && (
                <div className="transfer-menu">
                  <p>MOVE YOUR LIST</p>
                  <button type="button" onClick={() => importInput.current?.click()}><Upload size={15} />Import JSON or CSV</button>
                  <div className="transfer-divider" />
                  <button type="button" onClick={() => handleExport('json')}><FileText size={15} />Export as JSON</button>
                  <button type="button" onClick={() => handleExport('csv')}><FileText size={15} />Export as CSV</button>
                  <button type="button" onClick={() => handleExport('txt')}><FileText size={15} />Export as TXT</button>
                </div>
              )}
              <input ref={importInput} type="file" accept=".json,.csv,application/json,text/csv" className="visually-hidden" onChange={handleImport} aria-label="Import tasks from JSON or CSV" />
            </div>
            <button type="button" className="button button-primary top-add" onClick={() => setDialogTask(null)}><Plus size={17} />New task</button>
          </div>
        </header>

        <section className="dashboard-content">
          {storageError && <div className="storage-warning" role="alert">Local storage is unavailable: {storageError} Your existing data was not changed.</div>}
          <div className="welcome-row">
            <div>
              <p className="eyebrow">{greeting().toUpperCase()} · TAKE IT ONE STEP AT A TIME</p>
              <h1>Make room for <span>what matters.</span></h1>
              <p className="welcome-subtitle">{counts.Active === 0 ? 'You’re all caught up. Enjoy the breathing room.' : `You have ${counts.Active} thing${counts.Active === 1 ? '' : 's'} on your plate. You’ve got this.`}</p>
            </div>
            <div className="progress-card">
              <div className="progress-top"><span>YOUR PROGRESS</span><span className="progress-percent">{progress}<small>%</small></span></div>
              <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
              <div className="progress-caption"><CheckCheck size={14} />{completedCount} of {tasks.length} tasks complete</div>
            </div>
          </div>

          <section className="task-section" aria-labelledby="task-list-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">YOUR LIST</p>
                <h2 id="task-list-heading">{settings.view}<span className="heading-count">{visibleTasks.length}</span></h2>
              </div>
              <button type="button" className="button button-outline add-inline" onClick={() => setDialogTask(null)}><Plus size={16} />Add task</button>
            </div>
            <div className="task-toolbar">
              <label className="search-box">
                <Search size={17} />
                <input ref={searchInput} aria-label="Search tasks" value={settings.search} onChange={(event) => updateSettings({ search: event.target.value })} placeholder="Search your tasks..." />
                {settings.search && <button type="button" aria-label="Clear search" onClick={() => updateSettings({ search: '' })}><X size={14} /></button>}
                <kbd>⌘ K</kbd>
              </label>
              <div className="toolbar-controls">
                <div className="toolbar-select-wrap">
                  <button type="button" className="toolbar-select" onClick={() => setCategoryMenu((open) => !open)} aria-expanded={categoryMenu}><ListFilter size={15} />{settings.category === 'All categories' ? 'Category' : settings.category}<ChevronDown size={13} /></button>
                  {categoryMenu && <div className="select-popover">{['All categories', ...categories].map((category) => <button type="button" key={category} className={settings.category === category ? 'popover-selected' : ''} onClick={() => { updateSettings({ category }); setCategoryMenu(false) }}>{category}</button>)}</div>}
                </div>
                <label className="toolbar-select sort-select"><ArrowUpDown size={15} /><span className="sort-label">Sort</span>
                  <select aria-label="Sort tasks" value={settings.sort} onChange={(event) => updateSettings({ sort: event.target.value })}>
                    <option value="manual">Manual</option><option value="dueDate">Due date</option><option value="priority">Priority</option><option value="title">Title</option>
                  </select><ChevronDown size={13} />
                </label>
              </div>
            </div>

            <div className="task-list">
              {visibleTasks.map((task) => (
                <TaskItem key={task.id} task={task} onToggle={toggleTask} onEdit={(item) => setDialogTask(item)} onDelete={deleteTask}
                  onDragStart={(event, id) => { if (id) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id) } setDraggedId(id) }}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}
                  onDrop={(event, id) => { event.preventDefault(); reorderTasks(id) }} />
              ))}
              {!visibleTasks.length && (
                <div className="empty-state">
                  <span className="empty-illustration">{settings.search ? <Search size={22} /> : settings.view === 'Completed' ? <CheckCheck size={23} /> : <ArrowDownAZ size={23} />}</span>
                  <h3>{settings.search ? 'No matches just yet' : settings.view === 'Completed' ? 'Nothing checked off yet' : settings.view === 'Overdue' ? 'Nothing overdue' : 'A little space to begin'}</h3>
                  <p>{settings.search ? 'Try another search, or clear the search field.' : settings.view === 'Overdue' ? 'You’re right on track. No overdue tasks.' : 'Add a task and give your day a little direction.'}</p>
                  {!settings.search && settings.view !== 'Completed' && settings.view !== 'Overdue' && <button type="button" className="button button-primary" onClick={() => setDialogTask(null)}><Plus size={16} />Create your first task</button>}
                </div>
              )}
            </div>
            {visibleTasks.length > 0 && <p className="list-hint"><GripVertical size={14} />Drag a task to change its order</p>}
          </section>
          <footer className="app-footer"><span>Made for a more intentional day.</span><span><i />Your data lives on this device</span></footer>
        </section>
      </main>

      {dialogTask !== undefined && <TaskDialog task={dialogTask} onClose={() => setDialogTask(undefined)} onSave={handleSave} />}
      {toast && <div className={`toast toast-${toast.kind}`} role="status" aria-live="polite">{toast.kind === 'error' ? <CircleHelp size={16} /> : <CheckCheck size={16} />}{toast.message}</div>}
    </div>
  )
}
