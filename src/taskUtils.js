export const PRIORITIES = ['low', 'medium', 'high']
export const VIEWS = ['All tasks', 'Today', 'Upcoming', 'Active', 'Completed', 'Overdue']

export function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function createTask(fields, order = 0) {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: fields.title.trim(),
    description: fields.description.trim(),
    priority: fields.priority,
    dueDate: fields.dueDate,
    category: fields.category.trim(),
    completed: false,
    createdAt: now,
    updatedAt: now,
    order,
  }
}

export function taskMatchesView(task, view) {
  const today = localDateString()
  if (view === 'Completed') return task.completed
  if (view === 'Active') return !task.completed
  if (view === 'Overdue') return !task.completed && task.dueDate && task.dueDate < today
  if (view === 'Today') return !task.completed && task.dueDate === today
  if (view === 'Upcoming') return !task.completed && task.dueDate && task.dueDate > today
  return true
}

export function isOverdue(task) {
  return !task.completed && task.dueDate && task.dueDate < localDateString()
}

export function taskIdentity(task) {
  return `${task.title.trim().toLocaleLowerCase()}|${task.description.trim().toLocaleLowerCase()}`
}

export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        cell += character
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true
    } else if (character === ',') {
      row.push(cell)
      cell = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.')
  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  if (!rows.length) throw new Error('The selected CSV file is empty.')

  const headers = rows.shift().map((header) => header.trim().toLowerCase())
  const required = ['title', 'description', 'priority', 'due date', 'category', 'completed']
  const indices = Object.fromEntries(required.map((name) => [name, headers.indexOf(name)]))
  if (indices.title < 0 || indices.priority < 0) {
    throw new Error('CSV must include at least the title and priority columns.')
  }
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has a different number of columns.`)
    const get = (name) => (indices[name] < 0 ? '' : (values[indices[name]] ?? '').trim())
    return {
      title: get('title'),
      description: get('description'),
      priority: get('priority'),
      dueDate: get('due date'),
      category: get('category'),
      completed: get('completed'),
    }
  })
}

export function validateImportedTask(item, index) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`Task ${index + 1} must be an object.`)
  }
  const title = typeof item.title === 'string' ? item.title.trim() : ''
  if (!title) throw new Error(`Task ${index + 1} needs a title.`)
  if (title.length > 120) throw new Error(`Task ${index + 1} title must be 120 characters or fewer.`)
  const priority = typeof item.priority === 'string' ? item.priority.toLowerCase() : 'medium'
  if (!PRIORITIES.includes(priority)) throw new Error(`Task ${index + 1} has an invalid priority.`)
  const dueDate = typeof item.dueDate === 'string' ? item.dueDate : ''
  if (dueDate) {
    const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate)
    const parsed = dateParts && new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3])))
    if (!dateParts || parsed.toISOString().slice(0, 10) !== dueDate) {
      throw new Error(`Task ${index + 1} has an invalid due date.`)
    }
  }
  return {
    title,
    description: typeof item.description === 'string' ? item.description.trim() : '',
    priority,
    dueDate,
    category: typeof item.category === 'string' ? item.category.trim().slice(0, 40) : '',
    completed: item.completed === true || String(item.completed).toLowerCase() === 'true',
  }
}
