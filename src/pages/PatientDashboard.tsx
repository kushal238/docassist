import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import PatientLayout from '@/components/layout/PatientLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Upload, 
  FileText, 
  Loader2, 
  ChevronRight,
  CheckCircle2,
  Mic
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ingestDocument } from '@/lib/api';
import VoiceSymptomIntake, { SymptomSummary } from '@/components/patient/VoiceSymptomIntake';

interface Patient {
  id: string;
  full_name: string;
}

interface Document {
  id: string;
  filename: string;
  doc_type: string;
  status: string;
  created_at: string;
}

interface EncounterSummary {
  id: string;
  encounter_date: string;
  specialty: string;
  provider_name: string | null;
}

interface SoapNoteSummary {
  id: string;
  encounter_id: string;
  created_at: string | null;
  subjective: string | null;
  objective: any | null;
  assessment: string | null;
  plan: string | null;
}

export default function PatientDashboard() {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [encounters, setEncounters] = useState<EncounterSummary[]>([]);
  const [soapNotes, setSoapNotes] = useState<SoapNoteSummary[]>([]);
  const [selectedSoapNote, setSelectedSoapNote] = useState<SoapNoteSummary | null>(null);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState<string>('note');
  const [voiceIntakeOpen, setVoiceIntakeOpen] = useState(false);

  useEffect(() => {
    fetchPatientData();
  }, [profile?.id]);

  const fetchPatientData = async () => {
    if (!profile?.id) return;

    try {
      // Get or create patient record for this user
      let { data: patientData, error } = await supabase
        .from('patients')
        .select('*')
        .eq('owner_patient_profile_id', profile.id)
        .single();

      if (error && error.code === 'PGRST116') {
        // No patient record exists, create one
        const { data: newPatient, error: createError } = await supabase
          .from('patients')
          .insert({
            owner_patient_profile_id: profile.id,
            full_name: profile.full_name,
          })
          .select()
          .single();

        if (createError) throw createError;
        patientData = newPatient;
      } else if (error) {
        throw error;
      }

      setPatient(patientData);

      // Fetch documents
      if (patientData) {
        const { data: docsData } = await supabase
          .from('documents')
          .select('*')
          .eq('patient_id', patientData.id)
          .order('created_at', { ascending: false });

        setDocuments(docsData || []);

        const { data: encountersData } = await supabase
          .from('encounters')
          .select('id, encounter_date, specialty, provider_name')
          .eq('patient_id', patientData.id)
          .order('encounter_date', { ascending: false });

        setEncounters(encountersData || []);

        const { data: soapData } = await supabase
          .from('soap_notes')
          .select('id, encounter_id, created_at, subjective, objective, assessment, plan')
          .eq('patient_id', patientData.id)
          .order('created_at', { ascending: false });

        setSoapNotes(soapData || []);
      }
    } catch (error) {
      console.error('Error fetching patient data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !patient) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF file');
      return;
    }

    setUploading(true);
    try {
      const documentId = crypto.randomUUID();
      const storagePath = `patient/${patient.id}/${documentId}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      const { error: docError } = await supabase
        .from('documents')
        .insert({
          id: documentId,
          patient_id: patient.id,
          uploader_profile_id: profile?.id,
          storage_path: storagePath,
          filename: file.name,
          doc_type: docType as 'note' | 'lab' | 'imaging' | 'meds' | 'other',
          status: 'processed',
        });

      if (docError) throw docError;

      toast.success('Document uploaded successfully');

      // Trigger ingestion (mock)
      ingestDocument(documentId);

      fetchPatientData();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload document');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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

  const handleSymptomSubmit = async (summary: SymptomSummary) => {
    if (!patient || !profile?.id) {
      toast.error('Patient information not available');
      return;
    }

    try {
      // Format transcript with line breaks for readability
      const formattedTranscript = summary.transcript
        .split(/(?<=[.!?])\s+/)
        .join('\n\n');

      const fullReport = `PATIENT SYMPTOM REPORT
${'='.repeat(50)}

PRIMARY COMPLAINT
${summary.primarySymptom}

TIMELINE & SEVERITY
• Onset: ${summary.onset}
• Severity: ${summary.severity ? `${summary.severity}/10` : 'Not specified'}
• Progression: ${summary.progression}

ASSOCIATED SYMPTOMS
${summary.associatedSymptoms?.length > 0 ? summary.associatedSymptoms.map(s => `• ${s}`).join('\n') : '• None reported'}

RED FLAGS SCREENING
${summary.redFlags?.fever ? '⚠️ FEVER - YES' : '✓ Fever - No'}
${summary.redFlags?.chestPain ? '⚠️ CHEST PAIN - YES' : '✓ Chest Pain - No'}
${summary.redFlags?.breathingDifficulty ? '⚠️ BREATHING DIFFICULTY - YES' : '✓ Breathing Difficulty - No'}
${summary.redFlags?.confusion ? '⚠️ CONFUSION - YES' : '✓ Confusion - No'}
${summary.redFlags?.fainting ? '⚠️ FAINTING - YES' : '✓ Fainting - No'}

${'='.repeat(50)}
PATIENT'S OWN WORDS
${'='.repeat(50)}

${formattedTranscript}

${'='.repeat(50)}
Submitted: ${summary.timestamp}
Source: ${summary.source}`;

      // Store in the new symptom_reports table (use type assertion since table is new)
      const { error: reportError } = await (supabase as any)
        .from('symptom_reports')
        .insert({
          patient_id: patient.id,
          created_by_profile_id: profile.id,
          primary_symptom: summary.primarySymptom,
          onset_text: summary.onset,
          severity: summary.severity,
          progression: summary.progression,
          associated_symptoms: summary.associatedSymptoms || [],
          red_flags: summary.redFlags,
          full_transcript: formattedTranscript,
          full_report: fullReport,
          summary_data: summary,
        });

      if (reportError) throw reportError;

      // Also store the primary symptom in the symptoms table for doctor's quick view
      if (summary.primarySymptom) {
        const { error: symptomError } = await supabase
          .from('symptoms')
          .insert({
            patient_id: patient.id,
            description: summary.primarySymptom,
            severity: summary.severity,
            onset_date: summary.onset.includes('today') ? new Date().toISOString().split('T')[0] : null,
          });
        
        // Don't fail the whole submission if symptom insert fails
        if (symptomError) {
          console.warn('Failed to insert symptom:', symptomError);
        }
      }

      // Store associated symptoms as well
      if (summary.associatedSymptoms?.length > 0) {
        const associatedSymptomsData = summary.associatedSymptoms.map(symptom => ({
          patient_id: patient.id,
          description: `Associated: ${symptom}`,
          severity: null,
          onset_date: null,
        }));

        const { error: associatedError } = await supabase
          .from('symptoms')
          .insert(associatedSymptomsData);
          
        // Don't fail if this fails either
        if (associatedError) {
          console.warn('Failed to insert associated symptoms:', associatedError);
        }
      }

      toast.success('Symptom summary submitted successfully. Your doctor will review it.');
      fetchPatientData(); // Refresh data if needed
    } catch (error) {
      console.error('Error submitting symptom summary:', error);
      toast.error('Failed to submit symptom summary. Please try again.');
    }
  };

  if (loading) {
    return (
      <PatientLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PatientLayout>
    );
  }

  return (
    <PatientLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">My Health Documents</h1>
          <p className="text-muted-foreground">
            Upload and manage your health records
          </p>
        </div>

        {/* Voice Symptom Intake Button */}
        <div className="mb-6">
          <Card className="card-healthcare">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold mb-1">Report Symptoms</h3>
                  <p className="text-sm text-muted-foreground">
                    Use your voice to describe your symptoms quickly and accurately
                  </p>
                </div>
                <Button
                  onClick={() => setVoiceIntakeOpen(true)}
                  className="flex items-center gap-2"
                >
                  <Mic className="h-4 w-4" />
                  Start Voice Symptom Check
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Upload Section */}
          <Card className="card-healthcare">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Document
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Document Type</label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="note">Clinical Note</SelectItem>
                    <SelectItem value="lab">Lab Results</SelectItem>
                    <SelectItem value="imaging">Imaging</SelectItem>
                    <SelectItem value="meds">Medications</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="patient-file-upload"
                />
                <Button
                  variant="outline"
                  className="w-full h-24 border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <FileText className="h-5 w-5 mr-2" />
                      Click to upload PDF
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Documents List */}
          <Card className="card-healthcare">
            <CardHeader>
              <CardTitle className="text-lg">
                My Documents ({documents.length + soapNotes.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {documents.length === 0 && soapNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No documents uploaded yet
                </p>
              ) : (
                <div className="space-y-3">
                  {documents.length > 0 && (
                    <div className="space-y-2">
                      {documents.map((doc) => (
                        <Link
                          key={doc.id}
                          to={`/patient/doc/${doc.id}`}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium truncate max-w-[180px] group-hover:text-primary transition-colors">
                                {doc.filename}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {getDocTypeLabel(doc.doc_type)} • {format(new Date(doc.created_at), 'MMM d, yyyy')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {doc.status === 'processed' && (
                              <CheckCircle2 className="h-4 w-4 text-success" />
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}

                  {soapNotes.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase text-muted-foreground">Clinical Notes</p>
                      {soapNotes.map((note) => {
                        const encounter = encounters.find((item) => item.id === note.encounter_id);
                        const dateValue = encounter?.encounter_date || note.created_at || new Date().toISOString();
                        const provider = encounter?.provider_name || 'Clinician';
                        return (
                          <button
                            key={note.id}
                            type="button"
                            onClick={() => setSelectedSoapNote(note)}
                            className="flex w-full items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-medium">SOAP Note</p>
                                <p className="text-xs text-muted-foreground">
                                  {provider} • {format(new Date(dateValue), 'MMM d, yyyy')}
                                </p>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!selectedSoapNote} onOpenChange={() => setSelectedSoapNote(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>SOAP Note</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[65vh] pr-4">
            {selectedSoapNote && (
              <div className="space-y-4 text-sm">
                {selectedSoapNote.subjective && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Subjective</p>
                    <div className="bg-muted/40 rounded-lg p-3 whitespace-pre-wrap">
                      {selectedSoapNote.subjective}
                    </div>
                  </div>
                )}
                {selectedSoapNote.objective && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Objective</p>
                    <div className="bg-muted/40 rounded-lg p-3 whitespace-pre-wrap">
                      {typeof selectedSoapNote.objective === 'string'
                        ? selectedSoapNote.objective
                        : selectedSoapNote.objective?.text || JSON.stringify(selectedSoapNote.objective, null, 2)}
                    </div>
                  </div>
                )}
                {selectedSoapNote.assessment && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Assessment</p>
                    <div className="bg-muted/40 rounded-lg p-3 whitespace-pre-wrap">
                      {selectedSoapNote.assessment}
                    </div>
                  </div>
                )}
                {selectedSoapNote.plan && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Plan</p>
                    <div className="bg-muted/40 rounded-lg p-3 whitespace-pre-wrap">
                      {selectedSoapNote.plan}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <VoiceSymptomIntake
        open={voiceIntakeOpen}
        onClose={() => setVoiceIntakeOpen(false)}
        onSubmit={handleSymptomSubmit}
      />
    </PatientLayout>
  );
}
