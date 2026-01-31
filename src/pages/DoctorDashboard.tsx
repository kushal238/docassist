import { useState } from 'react';
import DoctorLayout from '@/components/layout/DoctorLayout';
import PatientList from '@/components/doctor/PatientList';
import CreatePatientDialog from '@/components/doctor/CreatePatientDialog';

export default function DoctorDashboard() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handlePatientCreated = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <DoctorLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Patient Dashboard</h1>
          <p className="text-muted-foreground">
            View and manage your patients' health records
          </p>
        </div>

        <PatientList
          key={refreshKey}
          onCreatePatient={() => setCreateDialogOpen(true)}
        />

        <CreatePatientDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onPatientCreated={handlePatientCreated}
        />
      </div>
    </DoctorLayout>
  );
}
