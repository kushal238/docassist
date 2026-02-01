import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('assign_patient_by_email', {
        p_email: email.trim(),
      });

      if (error) throw error;

      // RPC returns JSONB with error/success info
      const result = data as { error?: string; message?: string; success?: boolean };

      if (result?.error) {
        toast.error(result.message || 'Failed to assign patient');
        return;
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
