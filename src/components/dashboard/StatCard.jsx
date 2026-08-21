import React from 'react'

export default function StatCard({ title, value, icon, type, loading }) {
  if (loading) {
    return (
      <div className="stat-card">
        <div className="stat-info" style={{ width: '100%' }}>
          <div className="skeleton skeleton-text" style={{ width: '50%' }}></div>
          <div className="skeleton skeleton-value" style={{ width: '30%', marginTop: '8px' }}></div>
        </div>
        <div className="skeleton skeleton-circle"></div>
      </div>
    )
  }

  return (
    <div className="stat-card">
      <div className="stat-info">
        <span className="stat-title">{title}</span>
        <span className="stat-value">{value}</span>
      </div>
      <div className={`stat-icon-wrapper ${type}`}>
        {icon}
      </div>
    </div>
  )
}
