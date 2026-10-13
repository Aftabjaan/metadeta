import React, { useState } from 'react';
import {
  FolderKanban,
  Plus,
  Trash2,
  Copy,
  Edit2,
  Check,
  X,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { Project } from '../types';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface ProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  currentProjectId: string;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string) => void;
  onRenameProject: (id: string, newName: string) => void;
  onDuplicateProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({
  isOpen,
  onClose,
  projects,
  currentProjectId,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
}) => {
  const [newProjectName, setNewProjectName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    onCreateProject(newProjectName.trim());
    setNewProjectName('');
  };

  const handleStartRename = (project: Project) => {
    setEditingId(project.id);
    setEditName(project.name);
  };

  const handleSaveRename = (id: string) => {
    if (editName.trim()) {
      onRenameProject(id, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto overscroll-contain">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Stock Contributor Projects</h3>
              <p className="text-xs text-slate-500">
                Organize stock asset batches into distinct projects
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1 overscroll-contain bg-white">
          {/* Create New Project Form */}
          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Enter new project name (e.g. Travel Sunset Batch)..."
              className="flex-1 text-xs rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:bg-white"
            />
            <button
              type="submit"
              disabled={!newProjectName.trim()}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              Create Project
            </button>
          </form>

          {/* Projects List */}
          <div className="space-y-2">
            {projects.map((proj) => {
              const isCurrent = proj.id === currentProjectId;
              const isRenaming = editingId === proj.id;
              const completedCount = proj.items.filter((i) => i.status === 'completed').length;

              return (
                <div
                  key={proj.id}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                    isCurrent
                      ? 'border-blue-400 bg-blue-50/60 shadow-sm'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="text-xs font-bold rounded-lg bg-white border border-slate-300 px-2.5 py-1 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRename(proj.id)}
                          className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-1 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 truncate">{proj.name}</span>
                        {isCurrent && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                            Active
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                      <span>{proj.items.length} assets ({completedCount} ready)</span>
                      <span>•</span>
                      <span className="capitalize">{proj.marketplace}</span>
                      <span>•</span>
                      <span>{new Date(proj.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProject(proj.id);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-blue-600 hover:text-white text-slate-700 text-xs font-semibold border border-slate-200 transition-colors flex items-center gap-1 shadow-xs"
                      >
                        Switch
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleStartRename(proj)}
                      className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors shadow-xs"
                      title="Rename project"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDuplicateProject(proj.id)}
                      className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors shadow-xs"
                      title="Duplicate project"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {projects.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteProject(proj.id)}
                        className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 transition-colors shadow-xs"
                        title="Delete project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
