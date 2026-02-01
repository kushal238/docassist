import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Loader2, 
  Calendar,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Document {
  id: string;
  filename: string;
  doc_type: string;
  status: string;
  created_at: string;
}

interface Symptom {
  id: string;
  description: string;
  onset_date: string | null;
  severity: number | null;
  created_at: string;
}

interface TimelineTabProps {
  patientId: string;
  documents: Document[];
  symptoms: Symptom[];
  onRefresh: () => void;
}

export default function TimelineTab({ patientId, documents, symptoms, onRefresh }: TimelineTabProps) {
  // Symptom form state
  const [symptomDescription, setSymptomDescription] = useState('');
  const [symptomOnset, setSymptomOnset] = useState('');
  const [symptomSeverity, setSymptomSeverity] = useState([5]);
  const [savingSymptom, setSavingSymptom] = useState(false);

  const handleSymptomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symptomDescription.trim()) return;

    setSavingSymptom(true);
    try {
      const { error } = await supabase.from('symptoms').insert({
        patient_id: patientId,
        description: symptomDescription.trim(),
        onset_date: symptomOnset || null,
        severity: symptomSeverity[0],
      });

      if (error) throw error;

      toast.success('Symptom recorded');
      setSymptomDescription('');
      setSymptomOnset('');
      setSymptomSeverity([5]);
      onRefresh();
    } catch (error) {
      console.error('Error saving symptom:', error);
      toast.error('Failed to save symptom');
    } finally {
      setSavingSymptom(false);
    }
  };

  const getDocTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      note: 'Clinical Note',
      lab: 'Lab Results',
      imaging: 'Imaging',
      meds: 'Medications',
      other: 'Other',
    };
    return labels[type] || type;
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Left column: Symptom form */}
      <div className="space-y-6">
        {/* Symptom Intake */}
        <Card className="card-healthcare">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Record Symptom
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSymptomSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="symptom">Description</Label>
                <Textarea
                  id="symptom"
                  placeholder="Describe the symptom..."
                  value={symptomDescription}
                  onChange={(e) => setSymptomDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="onset">Onset Date</Label>
                  <Input
                    id="onset"
                    type="date"
                    value={symptomOnset}
                    onChange={(e) => setSymptomOnset(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Severity: {symptomSeverity[0]}/10</Label>
                  <Slider
                    value={symptomSeverity}
                    onValueChange={setSymptomSeverity}
                    min={1}
                    max={10}
                    step={1}
                    className="mt-3"
                  />
                </div>
              </div>
              <Button type="submit" disabled={savingSymptom || !symptomDescription.trim()}>
                {savingSymptom ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Symptom'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Right column: Documents & Symptoms list */}
      <div className="space-y-6">
        {/* Documents List */}
        <Card className="card-healthcare">
          <CardHeader>
            <CardTitle className="text-lg">Documents ({documents.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No documents uploaded yet
              </p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium truncate max-w-[200px]">
                          {doc.filename}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getDocTypeLabel(doc.doc_type)} • {format(new Date(doc.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={doc.status === 'processed' ? 'status-processed' : 'status-pending'}
                    >
                      {doc.status === 'processed' ? (
                        <><CheckCircle2 className="h-3 w-3 mr-1" /> Processed</>
                      ) : (
                        <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Pending</>
                      )}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Symptoms List */}
        <Card className="card-healthcare">
          <CardHeader>
            <CardTitle className="text-lg">Symptoms ({symptoms.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {symptoms.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No symptoms recorded yet
              </p>
            ) : (
              <div className="space-y-2">
                {symptoms.map((symptom) => (
                  <div
                    key={symptom.id}
                    className="p-3 rounded-lg bg-muted/50"
                  >
                    <p className="text-sm">{symptom.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {symptom.onset_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Onset: {format(new Date(symptom.onset_date), 'MMM d, yyyy')}
                        </span>
                      )}
                      {symptom.severity && (
                        <Badge variant="outline">
                          Severity: {symptom.severity}/10
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
