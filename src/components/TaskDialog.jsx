import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { PRIORITIES } from '../taskUtils.js'

const emptyTask = { title: '', description: '', priority: 'medium', dueDate: '', category: '' }

export default function TaskDialog({ task, onClose, onSave }) {
  const [fields, setFields] = useState(task ? { ...task } : { ...emptyTask })
  const [error, setError] = useState('')

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function updateField(event) {
    setFields((current) => ({ ...current, [event.target.name]: event.target.value }))
    setError('')
  }

  function submit(event) {
    event.preventDefault()
    const title = fields.title.trim()
    if (!title) return setError('Give this task a title before saving.')
    if (title.length > 120) return setError('Titles can be up to 120 characters.')
    if (fields.description.length > 1000) return setError('Descriptions can be up to 1,000 characters.')
    onSave({ ...fields, title, description: fields.description.trim(), category: fields.category.trim() })
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">{task ? 'MAKE AN UPDATE' : 'A FRESH START'}</p>
            <h2 id="dialog-title">{task ? 'Edit task' : 'Add a task'}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button>
        </div>
        <form onSubmit={submit} className="task-form">
          <label className="field-label" htmlFor="task-title">Task title <span aria-hidden="true">*</span></label>
          <input autoFocus id="task-title" name="title" value={fields.title} onChange={updateField} maxLength={120} placeholder="What needs to get done?" required />

          <label className="field-label" htmlFor="task-description">A few details <span className="optional">Optional</span></label>
          <textarea id="task-description" name="description" value={fields.description} onChange={updateField} maxLength={1000} rows={3} placeholder="Add a note to future you..." />

          <div className="form-grid">
            <div>
              <label className="field-label" htmlFor="task-priority">Priority</label>
              <select id="task-priority" name="priority" value={fields.priority} onChange={updateField}>
                {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority[0].toUpperCase() + priority.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="task-due-date">Due date</label>
              <input id="task-due-date" type="date" name="dueDate" value={fields.dueDate ?? ''} onChange={updateField} />
            </div>
          </div>
          <label className="field-label" htmlFor="task-category">Category <span className="optional">Optional</span></label>
          <input id="task-category" name="category" value={fields.category ?? ''} onChange={updateField} maxLength={40} placeholder="e.g. Work, Personal" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
            <button className="button button-primary" type="submit">{task ? 'Save changes' : 'Add task'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
