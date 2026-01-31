import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  FileEdit, 
  Loader2, 
  RefreshCw, 
  Copy, 
  Check,
  ChevronDown,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { BriefContent, Citation } from '@/lib/api';
import CitationChip from '@/components/CitationChip';

interface SOAPNote {
  subjective: { content: string; citations: Citation[] };
  objective: { content: string; citations: Citation[] };
  assessment: { content: string; citations: Citation[] };
  plan: { content: string; citations: Citation[] };
}

interface SOAPNoteGeneratorProps {
  patientId: string;
  brief: BriefContent;
  patientName?: string;
}

const sectionLabels = {
  subjective: { label: 'Subjective', description: 'Patient-reported symptoms and history' },
  objective: { label: 'Objective', description: 'Physical exam, vitals, lab results' },
  assessment: { label: 'Assessment', description: 'Clinical impression and differential' },
  plan: { label: 'Plan', description: 'Treatment plan and follow-up' },
};

export default function SOAPNoteGenerator({ 
  patientId, 
  brief,
  patientName 
}: SOAPNoteGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const [soapNote, setSoapNote] = useState<SOAPNote | null>(null);
  const [editedSections, setEditedSections] = useState<Record<string, string>>({});
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    subjective: true,
    objective: true,
    assessment: true,
    plan: true,
  });

  const generateSOAPNote = async () => {
    setGenerating(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-soap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ 
          patientId, 
          brief,
          patientName,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate SOAP note');
      }

      const data = await response.json();
      setSoapNote(data);
      setEditedSections({});
      toast.success('SOAP note generated successfully');
    } catch (error) {
      console.error('Error generating SOAP note:', error);
      toast.error('Failed to generate SOAP note');
    } finally {
      setGenerating(false);
    }
  };

  const regenerateSection = async (section: keyof SOAPNote) => {
    if (!soapNote) return;
    
    setRegeneratingSection(section);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-soap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ 
          patientId, 
          brief,
          patientName,
          regenerateSection: section,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate section');
      }

      const data = await response.json();
      setSoapNote(prev => prev ? {
        ...prev,
        [section]: data[section],
      } : null);
      
      // Clear any edits to this section
      setEditedSections(prev => {
        const updated = { ...prev };
        delete updated[section];
        return updated;
      });
      
      toast.success(`${sectionLabels[section].label} regenerated`);
    } catch (error) {
      console.error('Error regenerating section:', error);
      toast.error('Failed to regenerate section');
    } finally {
      setRegeneratingSection(null);
    }
  };

  const handleSectionEdit = (section: string, value: string) => {
    setEditedSections(prev => ({ ...prev, [section]: value }));
  };

  const copyToClipboard = async (section?: string) => {
    if (!soapNote) return;

    let textToCopy = '';
    
    if (section) {
      const sectionData = soapNote[section as keyof SOAPNote];
      const editedContent = editedSections[section];
      textToCopy = `${sectionLabels[section as keyof typeof sectionLabels].label}:\n${editedContent || sectionData.content}`;
    } else {
      // Copy all sections
      const sections = ['subjective', 'objective', 'assessment', 'plan'] as const;
      textToCopy = sections.map(s => {
        const content = editedSections[s] || soapNote[s].content;
        return `${sectionLabels[s].label}:\n${content}`;
      }).join('\n\n');
      
      textToCopy += '\n\n---\nClinical decision support only — not a diagnosis.';
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedSection(section || 'all');
      toast.success(section ? 'Section copied' : 'SOAP note copied to clipboard');
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileEdit className="h-4 w-4" />
          Generate Clinical Note
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileEdit className="h-5 w-5" />
            SOAP Note Generator
          </DialogTitle>
          <DialogDescription>
            Auto-generated clinical note based on patient records. Edit as needed.
          </DialogDescription>
        </DialogHeader>

        {!soapNote ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
              <FileEdit className="h-8 w-8 text-primary" />
            </div>
            <p className="text-muted-foreground text-center mb-6 max-w-sm">
              Generate a SOAP note from the clinical brief data. Each section includes citations to source documents.
            </p>
            <Button onClick={generateSOAPNote} disabled={generating} size="lg">
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileEdit className="h-4 w-4 mr-2" />
                  Generate SOAP Note
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard()}
                className="gap-1"
              >
                {copiedSection === 'all' ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                Copy All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={generateSOAPNote}
                disabled={generating}
                className="gap-1"
              >
                <RefreshCw className={`h-3 w-3 ${generating ? 'animate-spin' : ''}`} />
                Regenerate All
              </Button>
            </div>

            {(['subjective', 'objective', 'assessment', 'plan'] as const).map((section) => (
              <Collapsible 
                key={section} 
                open={expandedSections[section]}
                onOpenChange={() => toggleSection(section)}
              >
                <Card className="border">
                  <CardHeader className="py-3">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between cursor-pointer">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          {expandedSections[section] ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <Badge variant="secondary" className="font-bold">
                            {sectionLabels[section].label.charAt(0)}
                          </Badge>
                          {sectionLabels[section].label}
                          <span className="text-xs text-muted-foreground font-normal">
                            — {sectionLabels[section].description}
                          </span>
                        </CardTitle>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(section);
                            }}
                          >
                            {copiedSection === section ? (
                              <Check className="h-3 w-3 text-success" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              regenerateSection(section);
                            }}
                            disabled={regeneratingSection === section}
                          >
                            <RefreshCw className={`h-3 w-3 ${regeneratingSection === section ? 'animate-spin' : ''}`} />
                          </Button>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-2">
                      <Textarea
                        value={editedSections[section] ?? soapNote[section].content}
                        onChange={(e) => handleSectionEdit(section, e.target.value)}
                        className="min-h-[100px] text-sm"
                        placeholder={`Enter ${sectionLabels[section].label.toLowerCase()}...`}
                      />
                      {soapNote[section].citations.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-xs text-muted-foreground">Sources:</span>
                          {soapNote[section].citations.map((citation, i) => (
                            <CitationChip 
                              key={i} 
                              docName={citation.docName} 
                              page={citation.page}
                              patientId={patientId}
                            />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}

            <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>
                <strong>Disclaimer:</strong> Clinical decision support only — not a diagnosis. 
                Review and verify all information before including in the patient record.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
