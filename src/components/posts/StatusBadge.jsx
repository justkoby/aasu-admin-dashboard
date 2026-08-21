import React from 'react'

export default function StatusBadge({ status }) {
  const normalized = (status || 'draft').toLowerCase()

  const getLabel = () => {
    switch (normalized) {
      case 'published':
        return 'Published'
      case 'draft':
        return 'Draft'
      case 'in_review':
      case 'review':
      case 'pending':
        return 'Awaiting Review'
      default:
        return status
    }
  }

  return (
    <span className={`badge status-${normalized === 'review' || normalized === 'in_review' ? 'review' : normalized}`}>
      {getLabel()}
    </span>
  )
}
