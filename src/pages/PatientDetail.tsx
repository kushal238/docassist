import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import DoctorLayout from '@/components/layout/DoctorLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Clock, FileText, MessageSquare, Brain } from 'lucide-react';
import TimelineTab from '@/components/doctor/TimelineTab';
import ClinicalBriefTab from '@/components/doctor/ClinicalBriefTab';
import DeepAnalysisTab from '@/components/doctor/DeepAnalysisTab';
import ChatTab from '@/components/doctor/ChatTab';
import { BriefContent } from '@/lib/api';

interface Patient {
  id: string;
  full_name: string;
  dob: string | null;
}

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

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [existingBrief, setExistingBrief] = useState<BriefContent | null>(null);

  useEffect(() => {
    if (id) {
      fetchPatientData();
    }
  }, [id]);

  const fetchPatientData = async () => {
    try {
      setLoading(true);

      // Fetch patient
      const { data: patientData, error: patientError } = await supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .single();

      if (patientError) throw patientError;
      setPatient(patientData);

      // Fetch documents
      const { data: docsData } = await supabase
        .from('documents')
        .select('*')
        .eq('patient_id', id)
        .order('created_at', { ascending: false });

      setDocuments(docsData || []);

      // Fetch symptoms
      const { data: symptomsData } = await supabase
        .from('symptoms')
        .select('*')
        .eq('patient_id', id)
        .order('created_at', { ascending: false });

      setSymptoms(symptomsData || []);

      // Fetch latest brief
      const { data: briefsData } = await supabase
        .from('briefs')
        .select('content_json')
        .eq('patient_id', id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (briefsData && briefsData.length > 0) {
        setExistingBrief(briefsData[0].content_json as unknown as BriefContent);
      }
    } catch (error) {
      console.error('Error fetching patient data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DoctorLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DoctorLayout>
    );
  }

  if (!patient) {
    return (
      <DoctorLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">Patient not found</h2>
        </div>
      </DoctorLayout>
    );
  }

  return (
    <DoctorLayout
      breadcrumbs={[
        { label: 'Patients', href: '/doctor' },
        { label: patient.full_name },
      ]}
    >
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{patient.full_name}</h1>
          {patient.dob && (
            <p className="text-muted-foreground">
              DOB: {new Date(patient.dob).toLocaleDateString()}
            </p>
          )}
        </div>

        <Tabs defaultValue="timeline" className="space-y-6">
          <TabsList className="grid w-full max-w-xl grid-cols-4">
            <TabsTrigger value="timeline" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Timeline</span>
            </TabsTrigger>
            <TabsTrigger value="brief" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Quick Brief</span>
            </TabsTrigger>
            <TabsTrigger value="deep-analysis" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              <span className="hidden sm:inline">Deep Analysis</span>
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Ask Chart</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="animate-fade-in">
            <TimelineTab
              patientId={patient.id}
              documents={documents}
              symptoms={symptoms}
              onRefresh={fetchPatientData}
            />
          </TabsContent>

          <TabsContent value="brief" className="animate-fade-in">
            <ClinicalBriefTab
              patientId={patient.id}
              patientName={patient.full_name}
              existingBrief={existingBrief}
              onBriefGenerated={fetchPatientData}
            />
          </TabsContent>

          <TabsContent value="deep-analysis" className="animate-fade-in">
            <DeepAnalysisTab
              patientId={patient.id}
              patientName={patient.full_name}
            />
          </TabsContent>

          <TabsContent value="chat" className="animate-fade-in">
            <ChatTab patientId={patient.id} />
          </TabsContent>
        </Tabs>
      </div>
    </DoctorLayout>
  );
}
