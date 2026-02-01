import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface AssignPatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPatientAssigned: () => void;
}

export default function AssignPatientDialog({
  open,
  onOpenChange,
  onPatientAssigned,
}: AssignPatientDialogProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (!profile?.id) return;

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();

      // Find patient profile by email
      const { data: patientProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('email', normalizedEmail)
        .single();

      if (profileError) {
        if (profileError.code === 'PGRST116') {
          toast.error('No patient account found for that email.');
          return;
        }
        throw profileError;
      }

      if (patientProfile.role !== 'patient') {
        toast.error('This email does not belong to a patient account.');
        return;
      }

      // Get or create patient record
      let patientId = '';
      const { data: patientRecord, error: patientError } = await supabase
        .from('patients')
        .select('id')
        .eq('owner_patient_profile_id', patientProfile.id)
        .single();

      if (patientError && patientError.code === 'PGRST116') {
        // Create patient record if it doesn't exist
        const { data: createdPatient, error: createError } = await supabase
          .from('patients')
          .insert({
            owner_patient_profile_id: patientProfile.id,
            full_name: patientProfile.full_name,
          })
          .select('id')
          .single();

        if (createError) throw createError;
        patientId = createdPatient.id;
      } else if (patientError) {
        throw patientError;
      } else {
        patientId = patientRecord.id;
      }

      // Create doctor_patient assignment
      const { error: assignmentError } = await supabase
        .from('doctor_patient')
        .insert({
          doctor_profile_id: profile.id,
          patient_id: patientId,
        });

      if (assignmentError) {
        if (assignmentError.code === '23505') {
          toast.error('This patient is already assigned to you.');
          return;
        }
        throw assignmentError;
      }

      toast.success('Patient assigned successfully');
      setEmail('');
      onOpenChange(false);
      onPatientAssigned();
    } catch (error) {
      console.error('Error assigning patient:', error);
      toast.error('Failed to assign patient');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Assign Patient</DialogTitle>
            <DialogDescription>
              Enter the patient’s account email to add them to your roster.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="assign-email">Patient Email *</Label>
              <Input
                id="assign-email"
                type="email"
                placeholder="patient@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !email.trim()}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                'Assign Patient'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
