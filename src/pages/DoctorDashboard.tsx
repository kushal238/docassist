import { useState } from 'react';
import DoctorLayout from '@/components/layout/DoctorLayout';
import PatientList from '@/components/doctor/PatientList';
import AssignPatientDialog from '@/components/doctor/AssignPatientDialog';

export default function DoctorDashboard() {
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handlePatientAssigned = () => {
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
          onAssignPatient={() => setAssignDialogOpen(true)}
        />

        <AssignPatientDialog
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          onPatientAssigned={handlePatientAssigned}
        />
      </div>
    </DoctorLayout>
  );
}
