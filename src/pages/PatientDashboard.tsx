import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import PatientLayout from '@/components/layout/PatientLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Upload, 
  FileText, 
  Loader2, 
  ChevronRight,
  CheckCircle2
} from 'lucide-react';
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

export default function PatientDashboard() {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState<string>('note');

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
                My Documents ({documents.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No documents uploaded yet
                </p>
              ) : (
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
            </CardContent>
          </Card>
        </div>
      </div>
    </PatientLayout>
  );
}
