import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Loader2, 
  FileText, 
  Sparkles,
  AlertTriangle,
  Pill,
  TestTube,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { generateBrief, BriefContent, Citation } from '@/lib/api';
import CitationChip from '@/components/CitationChip';


interface ClinicalBriefTabProps {
  patientId: string;
  existingBrief: BriefContent | null;
  onBriefGenerated: () => void;
}

export default function ClinicalBriefTab({ 
  patientId, 
  existingBrief,
  onBriefGenerated 
}: ClinicalBriefTabProps) {
  const { profile } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [brief, setBrief] = useState<BriefContent | null>(existingBrief);

  const handleGenerateBrief = async () => {
    setGenerating(true);
    try {
      const newBrief = await generateBrief(patientId);
      setBrief(newBrief);

      // Save to database - use JSON.parse/stringify to ensure proper Json type
      await supabase.from('briefs').insert({
        patient_id: patientId,
        created_by_profile_id: profile?.id,
        content_json: JSON.parse(JSON.stringify(newBrief)),
      });

      toast.success('Clinical brief generated');
      onBriefGenerated();
    } catch (error) {
      console.error('Error generating brief:', error);
      toast.error('Failed to generate brief');
    } finally {
      setGenerating(false);
    }
  };

  const renderCitations = (citations: Citation[] | undefined) => {
    if (!citations || citations.length === 0) return null;
    return (
      <div className="inline-flex flex-wrap gap-1 ml-2">
        {citations.map((citation, i) => (
          <CitationChip key={i} docName={citation.docName} page={citation.page} />
        ))}
      </div>
    );
  };

  if (!brief) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-primary/10 p-6 mb-6">
          <Sparkles className="h-12 w-12 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-2">Generate Clinical Brief</h3>
        <p className="text-muted-foreground text-center max-w-md mb-6">
          AI will analyze uploaded documents and symptoms to create a comprehensive 
          clinical summary with citations.
        </p>
        <Button size="lg" onClick={handleGenerateBrief} disabled={generating}>
          {generating ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Analyzing Records...
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5 mr-2" />
              Generate Brief
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Clinical Brief</h2>
        <Button variant="outline" onClick={handleGenerateBrief} disabled={generating}>
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Regenerating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Regenerate
            </>
          )}
        </Button>
      </div>

      <div className="grid gap-6">
        {/* Summary */}
        <Card className="card-healthcare border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground leading-relaxed">
              {brief.summary}
              {renderCitations(brief.citations?.summary)}
            </p>
          </CardContent>
        </Card>

        {/* Two-column layout */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Relevant History */}
          <Card className="card-healthcare">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Relevant History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {brief.relevantHistory.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {renderCitations(brief.citations?.relevantHistory)}
            </CardContent>
          </Card>

          {/* Current Symptoms */}
          <Card className="card-healthcare">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Current Symptoms
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {brief.currentSymptoms.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-warning mt-2 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Medications & Allergies */}
          <Card className="card-healthcare">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Pill className="h-5 w-5" />
                Medications & Allergies
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Medications</h4>
                <ul className="space-y-1">
                  {brief.medications.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground">• {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Allergies</h4>
                <ul className="space-y-1">
                  {brief.allergies.map((item, i) => (
                    <li key={i} className="text-sm text-destructive">⚠️ {item}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Abnormal Labs */}
          <Card className="card-healthcare">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <TestTube className="h-5 w-5" />
                Abnormal Labs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {brief.abnormalLabs.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive mt-2 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {renderCitations(brief.citations?.abnormalLabs)}
            </CardContent>
          </Card>
        </div>

        {/* Missing Info */}
        {brief.missingInfo.length > 0 && (
          <Card className="card-healthcare border-l-4 border-l-warning">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-warning">
                <AlertTriangle className="h-5 w-5" />
                Missing Information to Confirm
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {brief.missingInfo.map((item, i) => (
                  <li key={i} className="text-sm text-muted-foreground">• {item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
