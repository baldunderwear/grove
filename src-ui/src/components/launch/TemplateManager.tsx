import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useConfigStore } from '@/stores/config-store';
import type { PromptTemplate } from '@/types/config';

interface TemplateManagerProps {
  onSelect: (template: PromptTemplate) => void;
}

export function TemplateManager({ onSelect }: TemplateManagerProps) {
  const templates = useConfigStore((s) => s.config?.templates ?? []);
  const addTemplate = useConfigStore((s) => s.addTemplate);
  const updateTemplate = useConfigStore((s) => s.updateTemplate);
  const removeTemplate = useConfigStore((s) => s.removeTemplate);

  const [editing, setEditing] = useState<string | null>(null); // template id or 'new'
  const [formName, setFormName] = useState('');
  const [formBody, setFormBody] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const startNew = () => {
    setEditing('new');
    setFormName('');
    setFormBody('');
  };

  const startEdit = (t: PromptTemplate) => {
    setEditing(t.id);
    setFormName(t.name);
    setFormBody(t.body);
  };

  const cancelEdit = () => {
    setEditing(null);
    setFormName('');
    setFormBody('');
  };

  const save = async () => {
    if (!formName.trim() || !formBody.trim()) return;
    if (editing === 'new') {
      await addTemplate(formName.trim(), formBody.trim());
    } else if (editing) {
      await updateTemplate(editing, { name: formName.trim(), body: formBody.trim() });
    }
    cancelEdit();
  };

  const handleDelete = async (id: string) => {
    if (confirmDelete === id) {
      await removeTemplate(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      // Auto-clear confirmation after 3s
      setTimeout(() => setConfirmDelete((prev) => (prev === id ? null : prev)), 3000);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--grove-white)]">Templates</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-[var(--grove-fog)] hover:text-[var(--grove-white)]"
          onClick={startNew}
          disabled={editing !== null}
        >
          <Plus className="size-3.5 mr-1" />
          New
        </Button>
      </div>

      <ScrollArea className="max-h-[200px]">
        <div className="flex flex-col gap-1">
          {templates.map((t) =>
            editing === t.id ? (
              <div key={t.id} className="flex flex-col gap-2 p-2 rounded bg-[var(--grove-deep)] border border-[var(--grove-canopy)]">
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Template name"
                  className="h-7 text-sm bg-[var(--grove-bark)] border-[var(--grove-canopy)]"
                />
                <textarea
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="Prompt body..."
                  rows={3}
                  className="w-full rounded border border-[var(--grove-canopy)] bg-[var(--grove-bark)] px-3 py-2 text-sm text-[var(--grove-white)] placeholder:text-[var(--grove-stone)] focus:outline-none focus:ring-1 focus:ring-[var(--grove-leaf)] resize-none"
                />
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={cancelEdit}>
                    <X className="size-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-[var(--grove-leaf)]" onClick={save} disabled={!formName.trim() || !formBody.trim()}>
                    <Check className="size-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <div
                key={t.id}
                className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--grove-deep)] cursor-pointer"
                onClick={() => onSelect(t)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--grove-white)] truncate">{t.name}</div>
                  <div className="text-xs text-[var(--grove-stone)] truncate">
                    {t.body.split('\n')[0]}
                  </div>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); startEdit(t); }}
                  >
                    <Pencil className="size-3 text-[var(--grove-fog)]" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                  >
                    <Trash2 className={`size-3 ${confirmDelete === t.id ? 'text-red-500' : 'text-[var(--grove-fog)]'}`} />
                  </Button>
                </div>
              </div>
            ),
          )}
        </div>
      </ScrollArea>

      {/* Inline new template form */}
      {editing === 'new' && (
        <div className="flex flex-col gap-2 p-2 rounded bg-[var(--grove-deep)] border border-[var(--grove-canopy)]">
          <Input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Template name"
            className="h-7 text-sm bg-[var(--grove-bark)] border-[var(--grove-canopy)]"
            autoFocus
          />
          <textarea
            value={formBody}
            onChange={(e) => setFormBody(e.target.value)}
            placeholder="Prompt body... Use {branch}, {project}, {path} for variables"
            rows={3}
            className="w-full rounded border border-[var(--grove-canopy)] bg-[var(--grove-bark)] px-3 py-2 text-sm text-[var(--grove-white)] placeholder:text-[var(--grove-stone)] focus:outline-none focus:ring-1 focus:ring-[var(--grove-leaf)] resize-none"
          />
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={cancelEdit}>
              <X className="size-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs text-[var(--grove-leaf)]" onClick={save} disabled={!formName.trim() || !formBody.trim()}>
              <Check className="size-3" />
            </Button>
          </div>
        </div>
      )}

      {templates.length === 0 && editing !== 'new' && (
        <div className="text-xs text-[var(--grove-stone)] text-center py-3">
          No templates yet. Create one to save reusable prompts.
        </div>
      )}
    </div>
  );
}
