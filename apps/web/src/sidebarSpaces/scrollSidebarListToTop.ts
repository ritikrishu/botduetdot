export function scrollSidebarListToTop() {
  document
    .querySelectorAll('[data-sidebar="sidebar"] [data-slot="sidebar-content"]')
    .forEach((content) => {
      content.closest('[data-slot="scroll-area-viewport"]')?.scrollTo({ top: 0 });
    });
}
