import { useEffect, useRef, useState } from 'react';
import styles from './FolderTree.module.css';
import { ChevronDownIcon, ChevronRightIcon, FileTextIcon, FolderOpenIcon } from '../../lib/icons';
import { useLogStore } from '../../state/logStore';
import type { ExploreEntry } from '@shared/types';

interface NodeState {
  children: ExploreEntry[] | null;
  expanded: boolean;
  loading: boolean;
}

/**
 * The sidebar's Explore tab — a lazy-loading local filesystem tree, mirroring
 * DLT Viewer's Explore panel (drive roots, expand-to-browse). Directories are
 * always listed; files are listed too when they look like a log (.log/.txt —
 * see LOG_FILE_EXTENSIONS) so they can be double-clicked open directly,
 * exactly like File > Open Log File… Double-clicking a folder instead reveals
 * it in the OS file explorer.
 */
export function FolderTree() {
  const [roots, setRoots] = useState<ExploreEntry[] | null>(null);
  const [nodes, setNodes] = useState<Map<string, NodeState>>(new Map());
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const clearLog = useLogStore((s) => s.clear);
  const appendBatch = useLogStore((s) => s.appendBatch);

  useEffect(() => {
    window.api.fs.listRoots().then(setRoots);
  }, []);

  async function toggleDirectory(path: string) {
    const current = nodesRef.current.get(path);

    if (current?.expanded) {
      setNodes((prev) => new Map(prev).set(path, { ...current, expanded: false }));
      return;
    }

    if (current?.children !== null && current?.children !== undefined) {
      setNodes((prev) => new Map(prev).set(path, { ...current, expanded: true }));
      return;
    }

    setNodes((prev) => new Map(prev).set(path, { children: null, expanded: true, loading: true }));
    const children = await window.api.fs.listChildren(path);
    setNodes((prev) => new Map(prev).set(path, { children, expanded: true, loading: false }));
  }

  function revealInExplorer(path: string) {
    window.api.fs.openInExplorer(path);
  }

  async function openLogFile(entry: ExploreEntry) {
    const result = await window.api.files.openLogAtPath(entry.path);
    if (!result) {
      window.alert(`Could not open "${entry.name}" — it may have been moved, deleted, or is unreadable.`);
      return;
    }
    clearLog();
    appendBatch(result.entries);
  }

  if (!roots) {
    return <div className={styles.placeholder}>Loading drives&hellip;</div>;
  }

  return (
    <>
      <div className={styles.tree}>
        {roots.map((root) => (
          <TreeBranch
            key={root.path}
            entry={root}
            depth={0}
            nodes={nodes}
            onToggleDirectory={toggleDirectory}
            onRevealFolder={revealInExplorer}
            onOpenFile={openLogFile}
          />
        ))}
      </div>
    </>
  );
}

function TreeBranch({
  entry,
  depth,
  nodes,
  onToggleDirectory,
  onRevealFolder,
  onOpenFile
}: {
  entry: ExploreEntry;
  depth: number;
  nodes: Map<string, NodeState>;
  onToggleDirectory: (path: string) => void;
  onRevealFolder: (path: string) => void;
  onOpenFile: (entry: ExploreEntry) => void;
}) {
  const isFile = entry.kind === 'file';
  const state = nodes.get(entry.path);
  const expanded = state?.expanded ?? false;
  const loading = state?.loading ?? false;
  const children = state?.children ?? null;

  return (
    <div>
      <div
        className={styles.row}
        style={{ paddingLeft: 6 + depth * 16, cursor: isFile ? 'default' : 'pointer' }}
        onClick={isFile ? undefined : () => onToggleDirectory(entry.path)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (isFile) onOpenFile(entry);
          else onRevealFolder(entry.path);
        }}
        title={isFile ? `${entry.path} — double-click to open` : `${entry.path} — double-click to reveal in File Explorer`}
      >
        <span className={styles.expandIcon}>
          {isFile ? null : loading ? (
            <span className={styles.spinner} />
          ) : expanded ? (
            <ChevronDownIcon size={12} color="var(--text-secondary)" />
          ) : (
            <ChevronRightIcon size={12} color="var(--text-secondary)" />
          )}
        </span>
        {isFile ? (
          <FileTextIcon size={14} color="var(--level-i)" />
        ) : (
          <FolderOpenIcon size={14} color={expanded ? 'var(--accent)' : 'var(--text-secondary)'} />
        )}
        <span className={styles.name}>{entry.name}</span>
      </div>

      {!isFile &&
        expanded &&
        children &&
        (children.length === 0 ? (
          <div className={styles.empty} style={{ paddingLeft: 6 + (depth + 1) * 16 + 19 }}>
            Empty
          </div>
        ) : (
          children.map((child) => (
            <TreeBranch
              key={child.path}
              entry={child}
              depth={depth + 1}
              nodes={nodes}
              onToggleDirectory={onToggleDirectory}
              onRevealFolder={onRevealFolder}
              onOpenFile={onOpenFile}
            />
          ))
        ))}
    </div>
  );
}
