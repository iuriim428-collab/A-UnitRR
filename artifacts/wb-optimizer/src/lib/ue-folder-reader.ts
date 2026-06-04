/**
 * File System Access API helpers.
 * Lets the user pick a local folder and read all .xlsx files from it.
 * Supported in Chrome / Edge / Opera. Falls back gracefully on Firefox.
 */

export const supportsFolderPicker = (): boolean =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (window as any).showDirectoryPicker({ mode: 'read' });
  } catch (e: any) {
    if (e?.name === 'AbortError') return null; // user cancelled
    throw e;
  }
}

export interface FolderEntry {
  name: string;
  file: File;
}

/** Returns all .xlsx / .xls files from a directory handle, sorted by name. */
export async function getXlsxFiles(dir: FileSystemDirectoryHandle): Promise<FolderEntry[]> {
  const entries: FolderEntry[] = [];
  for await (const entry of (dir as any).values()) {
    if (
      entry.kind === 'file' &&
      /\.(xlsx?)$/i.test(entry.name) &&
      !entry.name.startsWith('~$') // skip Excel lock files
    ) {
      const file = await entry.getFile();
      entries.push({ name: entry.name, file });
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
