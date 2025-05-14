'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Clock, TrashIcon } from 'lucide-react'; // Assuming TrashIcon is Trash2 from lucide-react

interface ClientNote {
  id: string;
  client_id: string;
  note: string;
  created_at: string;
  created_by: string; // Consider fetching/displaying user email/name if needed
}

interface ClientNotesTabProps {
  clientId: string | undefined; // Allow undefined if initially loading
  detailedClientNotes: ClientNote[];
  newNoteContent: string;
  setNewNoteContent: (value: string) => void;
  handleAddClientNote: () => Promise<void>;
  handleDeleteClientNote: (noteId: string) => Promise<void>;
  addingNote: boolean;
  deletingNoteId: string | null;
}

const ClientNotesTab: React.FC<ClientNotesTabProps> = ({
  detailedClientNotes,
  newNoteContent,
  setNewNoteContent,
  handleAddClientNote,
  handleDeleteClientNote,
  addingNote,
  deletingNoteId,
}) => {
  
  // JSX for the notes tab content will go here

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl text-[#1a365d]">Detailed Notes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="newNoteContent" className="mb-1 block text-sm font-medium text-gray-700">Add a New Note</Label>
            <Textarea
              id="newNoteContent"
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              placeholder="Type your note here..."
              rows={4}
              className="mb-2"
              disabled={addingNote}
            />
            <Button
              onClick={handleAddClientNote}
              disabled={addingNote || !newNoteContent.trim()}
              size="sm"
            >
              {addingNote ? 'Adding Note...' : 'Add Note'}
            </Button>
          </div>

          <div className="mt-6 space-y-3">
            <h4 className="text-md font-semibold text-gray-700 border-b pb-1">Existing Notes:</h4>
            {detailedClientNotes.length > 0 ? (
              detailedClientNotes.map(noteItem => (
                <div key={noteItem.id} className="p-3 border rounded-md bg-gray-50 text-sm shadow-sm">
                  <div className="flex justify-between items-start">
                    <p className="whitespace-pre-line text-gray-800 flex-grow mr-2">{noteItem.note}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClientNote(noteItem.id)}
                      disabled={deletingNoteId === noteItem.id}
                      className="flex-shrink-0 w-8 h-8 p-0"
                      title="Delete note"
                    >
                      {deletingNoteId === noteItem.id ? (
                        <Clock className="h-4 w-4 animate-spin" />
                      ) : (
                        <TrashIcon className="h-4 w-4 text-red-500" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Added on: {new Date(noteItem.created_at).toLocaleString()}
                  </p>
                  {/* TODO: Consider displaying who added the note (created_by) */}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No detailed notes added yet for this client.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ClientNotesTab; 