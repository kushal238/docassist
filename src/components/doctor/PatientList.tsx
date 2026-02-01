import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Search,
  User,
  Calendar,
  ChevronRight,
  Loader2,
  FileText,
  UserPlus,
} from 'lucide-react';
import { format } from 'date-fns';

interface Patient {
  id: string;
  full_name: string;
  dob: string | null;
  updated_at: string;
  document_count?: number;
}

interface PatientListProps {
  onAssignPatient: () => void;
}

export default function PatientList({ onAssignPatient }: PatientListProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error('Error fetching patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = patients.filter(patient =>
    patient.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={onAssignPatient}>
          <UserPlus className="h-4 w-4 mr-2" />
          Assign Patient
        </Button>
      </div>

      {/* Patient list */}
      {filteredPatients.length === 0 ? (
        <Card className="card-healthcare">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">No patients found</h3>
            <p className="text-muted-foreground text-sm mb-4">
              {searchQuery ? 'Try a different search term' : 'Assign a patient by their email to get started'}
            </p>
            {!searchQuery && (
              <Button onClick={onAssignPatient}>
                <UserPlus className="h-4 w-4 mr-2" />
                Assign Patient
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredPatients.map((patient) => (
            <Link
              key={patient.id}
              to={`/doctor/patient/${patient.id}`}
              className="block"
            >
              <Card className="card-healthcare hover:shadow-md transition-all group">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {patient.full_name}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {patient.dob && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            DOB: {format(new Date(patient.dob), 'MMM d, yyyy')}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          Updated {format(new Date(patient.updated_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
