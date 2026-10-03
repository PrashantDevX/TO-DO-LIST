import { useState } from 'react'
import { CalendarDays, Check, GripVertical, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { isOverdue } from '../taskUtils.js'

function formatDueDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

export default function TaskItem({ task, onToggle, onEdit, onDelete, onDragStart, onDragOver, onDrop }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const overdue = isOverdue(task)

  return (
    <article
      className={`task-row ${task.completed ? 'task-completed' : ''}`}
      draggable
      onDragStart={(event) => onDragStart(event, task.id)}
      onDragOver={onDragOver}
      onDrop={(event) => onDrop(event, task.id)}
      onDragEnd={() => onDragStart(null, null)}
    >
      <button className="drag-handle" type="button" aria-label={`Reorder ${task.title}`} title="Drag to reorder"><GripVertical size={18} /></button>
      <button
        type="button"
        className={`task-check ${task.completed ? 'is-checked' : ''}`}
        onClick={() => onToggle(task)}
        aria-label={task.completed ? `Mark ${task.title} active` : `Complete ${task.title}`}
        aria-pressed={task.completed}
      >
        {task.completed && <Check size={14} strokeWidth={2.8} />}
      </button>
      <div className="task-copy">
        <button type="button" className="task-title" onClick={() => onEdit(task)}>{task.title}</button>
        {task.description && <p className="task-description">{task.description}</p>}
        <div className="task-meta">
          <span className={`priority-dot priority-${task.priority}`}><i />{task.priority}</span>
          {task.category && <span className="category-chip">{task.category}</span>}
          {task.dueDate && <span className={`due-date ${overdue ? 'due-overdue' : ''}`}><CalendarDays size={13} />{overdue ? 'Overdue · ' : ''}{formatDueDate(task.dueDate)}</span>}
        </div>
      </div>
      <div className="task-menu-wrap">
        <button className="icon-button task-more" type="button" aria-label={`Options for ${task.title}`} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={19} /></button>
        {menuOpen && (
          <div className="task-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(task) }}><Pencil size={15} />Edit task</button>
            <button type="button" role="menuitem" className="danger-action" onClick={() => { setMenuOpen(false); onDelete(task) }}><Trash2 size={15} />Delete task</button>
          </div>
        )}
      </div>
    </article>
  )
}
