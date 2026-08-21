import React from 'react'

export default function PostFilters({ filters, onFilterChange, categories }) {
  const handleChange = (e) => {
    const { name, value } = e.target
    onFilterChange(name, value)
  }

  return (
    <div className="posts-filter-bar">
      {/* 1. Search by title */}
      <div className="filter-group search">
        <label htmlFor="search">Search Posts</label>
        <input
          id="search"
          name="search"
          type="text"
          value={filters.search}
          onChange={handleChange}
          placeholder="Search by title..."
          className="filter-input"
        />
      </div>

      {/* 2. Filter by status */}
      <div className="filter-group">
        <label htmlFor="status">Status</label>
        <select
          id="status"
          name="status"
          value={filters.status}
          onChange={handleChange}
          className="filter-select"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="in_review">Awaiting Review</option>
          <option value="published">Published</option>
        </select>
      </div>

      {/* 3. Filter by type */}
      <div className="filter-group">
        <label htmlFor="type">Type</label>
        <select
          id="type"
          name="type"
          value={filters.type}
          onChange={handleChange}
          className="filter-select"
        >
          <option value="">All Types</option>
          <option value="news">News</option>
          <option value="blog">Blog</option>
          <option value="event">Event</option>
          <option value="readout">Readout</option>
          <option value="press_release">Press Release</option>
        </select>
      </div>

      {/* 4. Filter by category */}
      <div className="filter-group">
        <label htmlFor="categoryId">Category</label>
        <select
          id="categoryId"
          name="categoryId"
          value={filters.categoryId}
          onChange={handleChange}
          className="filter-select"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* 5. Sort By */}
      <div className="filter-group">
        <label htmlFor="sortBy">Sort By</label>
        <select
          id="sortBy"
          name="sortBy"
          value={filters.sortBy}
          onChange={handleChange}
          className="filter-select"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="recently_updated">Recently Updated</option>
        </select>
      </div>
    </div>
  )
}
