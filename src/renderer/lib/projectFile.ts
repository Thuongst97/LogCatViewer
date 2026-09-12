import { useFilterStore } from '../state/filterStore';

/**
 * Loads a different filter set from a .lcv.json project file — shared by the
 * File menu's "Open Project…" and the Filters sidebar's "Load" button.
 */
export async function openProjectFile(): Promise<void> {
  const project = await window.api.files.openProjectDialog();
  if (project) useFilterStore.getState().loadFilters(project.filters);
}

/**
 * Saves the current filter set to a .lcv.json project file — shared by the
 * File menu's "Save Project…" and the Filters sidebar's "Save Filter" button.
 */
export async function saveProjectFile(): Promise<void> {
  const path = await window.api.files.saveProjectDialog('LogCat Viewer Project');
  if (!path) return;
  await window.api.files.saveProject(path, {
    name: 'LogCat Viewer Project',
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    filters: useFilterStore.getState().filters
  });
}
