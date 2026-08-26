/**
 * Navigation register — shared by the Sidebar spine and the MobileNav drawer.
 *
 * @module components/layout/nav
 */

export const NAV_ITEMS = [
  { folio: '01', href: '/library', label: 'Library' },
  { folio: '02', href: '/community', label: 'Community' },
  { folio: '03', href: '/publish', label: 'Publish' },
  { folio: '04', href: '/settings', label: 'Settings' },
] as const
