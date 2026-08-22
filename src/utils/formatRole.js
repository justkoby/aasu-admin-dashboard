/**
 * Human-readable role labels for profile roles stored in public.profiles.
 * Never exposes the raw role enum values to dashboard users.
 */
export const formatRole = (role) => {
  switch ((role || '').toLowerCase()) {
    case 'super_admin':
      return 'Super Admin'
    case 'communications_admin':
      return 'Communications Admin'
    case 'supervisor':
      return 'Supervisor'
    case 'contributor':
      return 'Contributor'
    default:
      return 'Team Member'
  }
}

export default formatRole
