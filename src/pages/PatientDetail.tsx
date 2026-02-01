import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import DoctorLayout from '@/components/layout/DoctorLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, MessageSquare, Sparkles } from 'lucide-react';
import UnifiedClinicalAnalysis from '@/components/doctor/UnifiedClinicalAnalysis';
import ChatTab from '@/components/doctor/ChatTab';

interface Patient {
  id: string;
  full_name: string;
  dob: string | null;
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<Patient | null>(null);

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

        <Tabs defaultValue="analysis" className="space-y-6">
          <TabsList className="grid w-full max-w-xl grid-cols-2">
            <TabsTrigger value="analysis" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Analysis</span>
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Ask Chart</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="animate-fade-in">
            <UnifiedClinicalAnalysis
              patientId={patient.id}
              patientName={patient.full_name}
              patientDOB={patient.dob}
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
