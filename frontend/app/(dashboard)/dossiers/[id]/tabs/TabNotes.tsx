import { formatDate } from '@/lib/constants';
import type { Dossier } from '@/types';
import { MessageSquare, Send } from 'lucide-react';

interface TabNotesProps {
  dossier: Dossier;
}

export default function DossierTabNotes({ dossier }: TabNotesProps) {
  const notes = dossier.notes;

  return (
    <div className="space-y-6">
      {/* Composer */}
      <div className="card">
        <h3 className="section-title">Nouvelle note</h3>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-status-blue-bg text-status-blue-text flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <textarea
            rows={3}
            placeholder="Ajouter une note interne pour l'équipe…"
            className="flex-1 px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-1 focus:ring-status-blue-text resize-none"
          />
          <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity">
            <Send className="w-4 h-4" />
            Publier
          </button>
        </div>
      </div>

      {/* Liste des notes */}
      {notes.length === 0 ? (
        <div className="card">
          <h3 className="section-title">Notes internes</h3>
          <p className="text-sm text-muted">Aucune note pour ce dossier.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => (
            <div key={note.id} className="card">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-status-green-bg text-status-green-text flex items-center justify-center shrink-0">
                  {note.auteur
                    .split(' ')
                    .map((part) => part[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{note.auteur}</span>
                    <span className="text-xs text-muted">{formatDate(note.date)}</span>
                  </div>
                  <p className="text-sm text-foreground mt-1.5">{note.contenu}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}